#!/usr/bin/env python3
"""Prepare a DeepSeek-authored four-view prompt, then verify a generated image.
Image generation is dispatched by the host agent using generation-request.json.
"""
import argparse
import json
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / 'skill/turnaround/template.json').read_text())
PRESETS = json.loads((ROOT / 'skill/turnaround/east-asian-presets.json').read_text())
FIELDS = {'age', 'gender', 'skin_tone', 'ethnicity', 'species', 'body', 'hair', 'costume', 'accessories', 'pose', 'notes', 'style', 'background', 'height', 'head_body_ratio', 'face_structure', 'facial_features'}


def minimum_height(gender):
    gender = str(gender).strip().lower()
    if any(word in gender for word in ('非二元', 'nonbinary', 'non-binary')):
        return None
    # Free-text roles such as 女修士/男性老者 must not bypass the height floor.
    if '男' in gender:
        return 185
    if '女' in gender:
        return 170
    if re.search(r'\b(female|woman|girl)\b', gender):
        return 170
    if re.search(r'\b(male|man|boy)\b', gender):
        return 185
    return None


def height_cm(value):
    match = re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(cm|厘米|公分|m|米)\s*', str(value), re.I)
    if not match:
        raise ValueError('身高须为确定的带单位数值，如185cm')
    value = float(match[1]) * (100 if match[2].lower() in ('m', '米') else 1)
    if not 0 < value < float('inf'):
        raise ValueError('身高必须为有限正数')
    return value


def check_height(height, gender):
    floor = minimum_height(gender)
    value = height_cm(height)
    if floor and value < floor:
        raise ValueError(f'身高未达项目硬性要求：{gender}至少{floor}cm；请修改角色设定')


def validate_project_character(data, settings):
    gender = settings.get('gender') or data.get('basic_info', {}).get('gender', '')
    if not gender:
        raise ValueError('角色缺少gender，无法核对项目身高要求')
    check_height(data['fingerprint']['height'], gender)
    if settings.get('height') and height_cm(data['fingerprint']['height']) != height_cm(settings['height']):
        raise ValueError('角色身高与明确设置不一致')


def settings_for(raw):
    if not isinstance(raw, dict):
        raise ValueError('设置必须是 JSON 对象')
    unknown = set(raw) - FIELDS - {'template', 'side', 'portrait_fraction', 'show_info', 'quality'}
    if unknown:
        raise ValueError('未知设置: ' + ', '.join(sorted(unknown)))
    if 'show_info' in raw and not isinstance(raw['show_info'], bool):
        raise ValueError('show_info 必须为布尔值')
    result = dict(SPEC['defaults'])
    result.update(raw)
    if result['quality'] not in SPEC['quality_tiers']:
        raise ValueError('quality 必须为 2k 或 1080p')
    tier = SPEC['quality_tiers'][result['quality']]
    result.update(image_width=tier['width'], image_height=tier['height'])
    if result['template'] not in SPEC['templates']:
        raise ValueError('未知模板')
    if result['side'] not in ('left', 'right'):
        raise ValueError('side 必须为 left 或 right')
    fraction = result['portrait_fraction']
    if isinstance(fraction, bool) or not isinstance(fraction, (int, float)) or not .2 <= fraction <= .4:
        raise ValueError('portrait_fraction 必须在 0.20–0.40 之间')
    for key in FIELDS & raw.keys():
        if not isinstance(raw[key], str) or len(raw[key]) > 6000:
            raise ValueError(key + ' 必须是最多 6000 字符的文本')
    template = SPEC['templates'][result['template']]
    for key in ('style', 'background'):
        result.setdefault(key, template[key])
    if result.get('height') and result.get('gender'):
        check_height(result['height'], result['gender'])
    return result


def credentials():
    path = Path.home() / '.config/llm/deepseek.env'
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.removeprefix('export ').split('=', 1)
            values[key.strip()] = value.strip().strip('\"\'')
    if not values.get('DEEPSEEK_API_KEY'):
        raise ValueError('共享配置缺少 DEEPSEEK_API_KEY')
    return values


def api(path, key, payload=None):
    # The shared key is never sent to configurable third-party endpoints.
    req = urllib.request.Request('https://api.deepseek.com/' + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    try:
        with urllib.request.build_opener(NoRedirect).open(req) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise ValueError(f'DeepSeek HTTP {exc.code}，未输出响应正文以避免泄漏') from None
    except urllib.error.URLError:
        raise ValueError('无法连接 DeepSeek 官方 API') from None


def load_cast(path):
    if path is None:
        return []
    data = json.loads(path.read_text())
    if not isinstance(data, list) or len(data) > 30:
        raise ValueError('角色库必须是最多30个角色的 JSON 数组')
    for asset in data:
        if not isinstance(asset, dict) or not isinstance(asset.get('name'), str) or not asset['name'].strip():
            raise ValueError('角色库每项需要非空 name')
        validate_fingerprint(asset.get('fingerprint'))
    return data


FINGERPRINT_FIELDS = ('height', 'head_body_ratio', 'face_structure', 'facial_features', 'hair', 'body_silhouette', 'costume_silhouette', 'palette')


def validate_fingerprint(value):
    if not isinstance(value, dict) or set(value) != set(FINGERPRINT_FIELDS):
        raise ValueError('角色 fingerprint 必须包含全部8项差异特征')
    if any(not isinstance(v, str) or not v.strip() for v in value.values()):
        raise ValueError('角色差异特征必须是非空文本')


def validate_differences(data, cast):
    validate_fingerprint(data.get('fingerprint'))
    comparisons = data.get('cast_comparison', [])
    if not isinstance(comparisons, list) or len(comparisons) != len(cast):
        raise ValueError('缺少逐角色差异对照')
    for asset, comparison in zip(cast, comparisons):
        if not isinstance(comparison, dict) or comparison.get('name') != asset['name']:
            raise ValueError('角色对照顺序或名称不匹配')
        axes = comparison.get('differences')
        if not isinstance(axes, dict) or not set(axes) <= set(FINGERPRINT_FIELDS):
            raise ValueError('differences必须为对象，键只能是：' + ', '.join(FINGERPRINT_FIELDS))
        if len(axes) < 4 or not set(axes) & {'face_structure', 'facial_features'} or not set(axes) & {'height', 'head_body_ratio', 'body_silhouette'}:
            raise ValueError('区分度不足：至少4轴，包含面相与身形比例')
        for axis, reason in axes.items():
            if not isinstance(reason, str) or not reason.strip() or data['fingerprint'][axis].strip() == asset['fingerprint'][axis].strip():
                raise ValueError('差异说明为空或该轴实际相同')


def expand(brief, settings, model, cast):
    key = credentials()['DEEPSEEK_API_KEY']
    models = {entry['id'] for entry in api('models', key)['data']}
    if model not in models:
        raise ValueError(f'官方模型列表未提供 {model}；请通过 --model 指定可用模型')
    system = '''你是电影角色定妆设计师。将简述与设置扩写为结构化中文 JSON。
支持所有年龄、肤色、族裔、性别和虚构种族，不默认成年东方女性，不套用性感或美颜审美。项目硬要求：女性身高>=170cm，男性身高>=185cm，包括明确为男孩/女孩的虚构角色。禁止矮胖、粗短或圆厚的身体轮廓；默认高挑修长或匀称。保持年龄面容，儿童不成人化；异常高个儿童须标明虚构非常规身高，不伪称典型生理比例。
默认服饰为中国古风修仙玄幻：丝绸、缎面、织锦、云纹刺绣、玉饰与金银配件，款式含交领、叠襟、腰封、披帛或结构清楚的玄幻护肩；禁止粗麻布、麻袋质感、灰暗工装、暗灰主配色及灰暗粗粝风格。颜色用月白、青玉、天青、朱红、紫金等按角色分配；装饰有层次且不遮挡脸和身体轮廓。衣物有可信厚度、垂坠及连接，不能塑料化或发光糊成一片。用户设置优先于模板默认。保留明确年龄、性别、肤色、身体条件和服装。空属性可创作补全，在 assumptions 中标出。不要推断真实人物族裔，不虚构已看过参考图。儿童、婴儿和年龄不明角色使用适龄非性化造型。
输出对象包含 sections（以下七个键，每项为详细中文段落）、assumptions（字符串列表）、negative（字符串）、fingerprint、cast_comparison、basic_info（对象，含age与gender非空字符串，记录年龄与性别；未指定则标为创作设定）。
fingerprint 必须含8个非空字符串字段：height（设定身高，如185cm）、head_body_ratio（头身比，如6.8头身）、face_structure（脸型骨相）、facial_features（眉眼鼻唇组合）、hair（发型轮廓）、body_silhouette（体型轮廓）、costume_silhouette（服装结构轮廓）、palette（主配色）。这些特征必须落实到对应 sections。用户未给的身高、头身比作为创作设定明确记录 assumptions，不能称为测量事实。比例符合年龄与物种，不把儿童写成成人比例。
用户提供 cast 时，新角色对每个已有角色至少4个视觉轴有明显差异，且必须包含面相骨相/五官之一，以及身高/头身比/体型之一。优先拉开身高梯度（一般8–15cm以上，符合年龄及设定）、头身比、骨相五官、发型剪影、服装轮廓；不能仅换颜色、年龄标签或同义词。不能用族裔性别刻板印象代替个人设计。保留用户明确设定，在自由项建立区别；如果明确设定冲突导致无法区分，不要谎称通过。
cast_comparison 为数组，按照 cast 顺序逐个输出 {"name":"角色名","differences":{"差异轴":"对照原角色的具体可见区别"}}；没有 cast 时为空数组。
sections 键：人物身份与面部、体型与比例、肤色与皮肤质感、头发与妆容、服装、配饰、道具与鞋履、气质与风格控制。
注意“配饰、道具与鞋履”是一个完整键。各段应细化可见特征和跨视角不变量；未知精确身高不要伪装事实。
只描述角色本身，不写构图、景别、视图数量、朝向、占比、摄影或背景，这些由程序固定编译。气质与风格控制只写气质和材质风格。
每个细节必须确定，不使用“或者”“例如”“可有”“若出现”等备选。用户未要求道具时双手自然空手，不新增手表、眼镜或职业道具；古风玉簪、发冠、腰佩可按服装主题具体设计并标明补全，但不自动添加武器。衣服款式缺省时选择一套具体款式并在 assumptions 标注。
不创作剧情动作或多人合影。所有视图是同一角色同一造型。负向词禁止歧视性的人口属性排除，仅列本角色相关失误。输出 JSON，不要 Markdown。'''
    skeleton = {'sections': {k: '详细中文段落' for k in SPEC['sections']},
                'assumptions': [], 'negative': '仅角色相关失误，不写禁止一切文字；文字模式由程序控制',
                'fingerprint': {k: '确定的角色特征' for k in FINGERPRINT_FIELDS},
                'cast_comparison': [{'name': c['name'], 'differences': {k: '与该角色的具体可见区别；相同的轴删去' for k in FINGERPRINT_FIELDS}} for c in cast],
                'basic_info': {'age': '年龄', 'gender': '性别'}}
    system += '\n严格使用这个JSON键结构（不要拆分或改名）：' + json.dumps(skeleton, ensure_ascii=False)
    messages = [{'role': 'system', 'content': system}, {'role': 'user', 'content': json.dumps(
        {'brief': brief, 'settings': {k: v for k, v in settings.items() if k in FIELDS and k != 'background'}, 'cast': cast}, ensure_ascii=False)}]
    for attempt in range(2):
        response = api('chat/completions', key, {'model': model, 'messages': messages,
            'response_format': {'type': 'json_object'}})
        choice = response['choices'][0]
        if choice.get('finish_reason') != 'stop':
            raise ValueError('模型输出未完整结束，未写入不完整提示词')
        content = choice['message']['content']
        try:
            data = json.loads(content)
            if isinstance(data, dict) and isinstance(data.get('negative'), list) and all(isinstance(v, str) for v in data['negative']):
                data['negative'] = '，'.join(data['negative'])
            validate_content(data)
            validate_differences(data, cast)
            validate_project_character(data, settings)
            return data
        except ValueError as exc:
            if attempt == 1:
                raise ValueError('模型结构校验两次未通过：' + str(exc)) from None
            messages.extend([{'role': 'assistant', 'content': content},
                             {'role': 'user', 'content': '仅修正JSON结构并保持已确定角色设计。错误：' + str(exc) + '。返回完整JSON。'}])


def validate_content(data):
    if not isinstance(data, dict) or not isinstance(data.get('sections'), dict):
        raise ValueError('角色结构缺少 sections')
    if set(data['sections']) != set(SPEC['sections']):
        raise ValueError('角色章节不完整或包含未知章节')
    if any(not isinstance(v, str) or not v.strip() for v in data['sections'].values()):
        raise ValueError('角色章节必须是非空文本')
    if 'basic_info' in data and (not isinstance(data['basic_info'], dict) or not isinstance(data['basic_info'].get('age'), str)):
        raise ValueError('basic_info.age 必须为文本')
    if not isinstance(data.get('negative'), str):
        raise ValueError('negative 必须是文本')
    if not isinstance(data.get('assumptions'), list) or any(not isinstance(v, str) for v in data['assumptions']):
        raise ValueError('assumptions 必须是文本列表')


def compose(brief, settings, data, name="角色"):
    age = settings.get("age") or data.get("basic_info", {}).get("age", "年龄未设定")
    validate_content(data)
    side, nose = ('左', '左') if settings['side'] == 'left' else ('右', '右')
    layout = f'''生成一张横向16:9、原生{settings['image_width']}×{settings['image_height']}像素（整张{SPEC['quality_tiers'][settings['quality']]['label']}）的角色四视图定妆参考图。{settings['style']}。
【项目体型硬约束】
女性至少170cm，男性至少185cm；保留角色年龄与身份，采用高挑修长或匀称体型，避免矮胖、粗短和圆厚体型。身高为创作设定，不能通过裁脚、缩头或拉腿伪造。
【服饰约束】
默认中国古风修仙玄幻服饰，以丝绸、缎面、织锦、刺绣、玉饰及金银装饰表现精致结构；禁止粗麻布、暗灰主配色、灰暗工装与灰暗粗粝风格。中性摄影棚不改变服饰配色。
【用户原始设定】
{brief}
【明确设置】
''' + json.dumps({k: v for k, v in settings.items() if k in FIELDS and v}, ensure_ascii=False) + f'''
【画面布局】
从左至右严格四栏：正面人像特写；正面全身0°；标准侧面全身90°（角色自身{side}侧，鼻尖朝画面{nose}方）；背面全身180°。
头像约占宽度{settings['portrait_fraction']:.0%}，其余三全身均分剩余空间。各栏轮廓不重叠，留中性背景空隙，无边框或分隔线。这是同一个角色的四个参考视图，不是四人合影，不是四个全身。
'''
    if 'fingerprint' in data:
        layout += '【角色差异与身份锚点（创作设定）】\n' + json.dumps(data['fingerprint'], ensure_ascii=False) + '\n各视图保持本角色比例；与其他角色的差异不通过改变镜头焦距或单栏缩放伪造。\n'
    body = '\n\n'.join(f'【{name}】\n{data["sections"][name]}' for name in SPEC['sections'])
    end = f'''
【姿态与取景】
头像正面眼平，头顶至锁骨及少量上胸，头顶留余量。三个全身从头顶至鞋底或足底完整可见，同缩放、同头顶高度、同脚底基线，衣摆和道具不裁切。默认自然稳定姿态；明确指定婴儿、轮椅或身体条件时采用同一适配支撑姿态，保持各视角比例对应。
侧面头部、胸腔、骨盆朝向一致，准确90°，不以四分之三代替。背面180°不回头、不扭腰。
【背景、摄影与照明】
{settings['background']}。统一柔光与白平衡，暗部保留材质，避免过曝。中长焦低透视畸变，镜头水平。全身、脸、衣料与道具均清楚，避免强浅景深和广角拉伸。
【一致性与画面限制】
同一个人、同一时刻、同一表情、同一套服装。锁定五官、年龄、肤色、发型、体型、服装结构、材质和配饰数量。左右以角色自身为准，不镜像互换；遮挡随视角合理变化。道具受重力并有可信接触，不跨栏连接。只有四视图，无其他人物、额外头像、身高标尺、签名或水印。文字仅按下方信息显示模式执行。
'''
    info = data.get('fingerprint', {})
    height_label = re.split(r'[，,（(]', info.get('height', '身高未设定'))[0]
    ratio_label = re.split(r'[，,（(]', info.get('head_body_ratio', '头身比未设定'))[0]
    caption = f"{name}｜{age}｜{height_label}｜{ratio_label}"
    if settings.get('show_info', False):
        end += '\n【底部简要信息】\n在画面最下方约6%的独立灰色留白区，居中显示一行清晰、简洁、低调的深灰中文文字，内容精确为：' + caption + '。仅这一行，不加说明、标尺或图例。四视图位于其上方，脚底与文字留出间隔，不覆盖人物、鞋履或衣摆，不为加字裁切人物。\n'
    else:
        end += '\n【纯图模式】不显示任何文字、姓名、年龄、身高、头身比或标签；不预留信息条，人物画面保持完整。\n'
    negative = '身份漂移，年龄漂移，肤色漂移，服装不一致，多余视图，缺少特写，四人合影，头脚裁切，比例错位，背面回头，侧面变成四分之三，左右配饰互换，畸形手脚，悬浮道具，多余文字，错字，文字遮挡人物，水印。' + data['negative']
    return layout + body + end, negative


REVIEW_ITEMS = ('four_views', 'identity_and_costume', 'angles_and_sides',
                'full_body_uncropped', 'body_and_age', 'cast_distinction', 'optional_caption')


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def inspect_image(path, expected):
    from PIL import Image
    with Image.open(path) as im:
        im.load()
        size = list(im.size)
    return {'actual': size, 'expected': expected, 'pixel_check_passed': size == expected,
            'visual_review': 'required'}


def manage_asset(args):
    directory = args.output
    path = directory / 'generation-request.json'
    request = json.loads(path.read_text())
    command = args.command
    if command == 'status':
        print(json.dumps({k: v for k, v in request.items() if k != 'prompt'}, ensure_ascii=False, indent=2))
        return 0
    if command == 'defer':
        if request['status'] not in ('awaiting_image_generation', 'deferred'):
            raise ValueError('已有图片结果不能标记为未出图；如需重试请先 resume')
        request.update(status='deferred', deferred_reason=args.reason)
    elif command == 'resume':
        # Recompile only. Dispatch remains with the host; never changes providers.
        raw = {k: v for k, v in request['settings'].items() if k in FIELDS or k in ('template', 'side', 'portrait_fraction', 'show_info', 'quality')}
        if args.quality:
            raw['quality'] = args.quality
        settings = settings_for(raw)
        data = json.loads((directory / 'character.json').read_text())
        asset = json.loads((directory / 'asset.json').read_text())
        validate_project_character(data, settings)
        prompt, negative = compose(request['brief'], settings, data, asset['name'])
        (directory / 'prompt.txt').write_text(prompt)
        (directory / 'negative.txt').write_text(negative)
        request.update(status='awaiting_image_generation', settings=settings,
                       expected_size=[settings['image_width'], settings['image_height']],
                       prompt=prompt + '\n【负向约束】\n' + negative)
        request.pop('deferred_reason', None)
        request.pop('current_attempt', None)
    elif command == 'record-image':
        if request['status'] not in ('awaiting_image_generation', 'deferred'):
            raise ValueError('请先 resume 再记录新版本，历史图片将保留')
        result = inspect_image(args.image, request['expected_size'])
        identifier = uuid.uuid4().hex
        target = directory / ('image-' + identifier + args.image.suffix.lower())
        shutil.copy2(args.image, target)
        attempt = {'id': identifier, 'file': target.name, 'validation': result,
                   'quality': request['settings'].get('quality', '2k'), 'created_at': datetime.now(timezone.utc).isoformat()}
        request.setdefault('attempts', []).append(attempt)
        request.update(current_attempt=identifier, status='awaiting_visual_review' if result['pixel_check_passed'] else 'resolution_unmet')
        request.pop('deferred_reason', None)
    elif command == 'review':
        if request['status'] not in ('awaiting_visual_review', 'resolution_unmet', 'visual_review_failed', 'accepted'):
            raise ValueError('请先 record-image，再进行人工看图验收')
        review = json.loads(args.checklist.read_text())
        if not isinstance(review, dict) or set(review.get('checks', {})) != set(REVIEW_ITEMS):
            raise ValueError('验收 checks 必须包含：' + ', '.join(REVIEW_ITEMS))
        if any(type(v) is not bool for v in review['checks'].values()) or not isinstance(review.get('notes'), str) or not review['notes'].strip():
            raise ValueError('验收各项必须为布尔值，notes 须记录看图依据或失败原因')
        attempt = next(a for a in request['attempts'] if a['id'] == request['current_attempt'])
        # Recheck pixels, so a modified file cannot inherit a stale size pass.
        attempt['validation'] = inspect_image(directory / attempt['file'], attempt['validation']['expected'])
        attempt.setdefault('reviews', []).append(review)
        attempt['validation']['visual_review'] = 'passed' if all(review['checks'].values()) else 'failed'
        request['status'] = ('resolution_unmet' if not attempt['validation']['pixel_check_passed'] else
                             'accepted' if all(review['checks'].values()) else 'visual_review_failed')
    request.setdefault('events', []).append({'action': command, 'status': request['status'], 'time': datetime.now(timezone.utc).isoformat()})
    write_json(path, request)
    print(json.dumps({'status': request['status'], 'expected_size': request['expected_size']}, ensure_ascii=False))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    prepare = commands.add_parser('prepare')
    prepare.add_argument('--brief', required=True)
    prepare.add_argument('--quality', choices=tuple(SPEC['quality_tiers']))
    prepare.add_argument('--settings', type=Path)
    prepare.add_argument('--preset', choices=tuple(PRESETS))
    prepare.add_argument('--show-info', action='store_true', help='可选：底部显示姓名、年龄、身高、头身比')
    prepare.add_argument('--content', type=Path, help='已有角色 JSON；离线编译，不调用 API')
    prepare.add_argument('--cast', type=Path, help='已有角色资产对照库 JSON')
    prepare.add_argument('--name', default='新角色')
    prepare.add_argument('--model', default='deepseek-flash')
    prepare.add_argument('--output', type=Path, required=True)
    commands.add_parser('presets', help='列出东方面孔角色起点')
    verify = commands.add_parser('verify-image')
    verify.add_argument('image', type=Path)
    verify.add_argument('--quality', choices=tuple(SPEC['quality_tiers']), default='2k')
    for name in ('status', 'defer', 'resume', 'record-image', 'review'):
        sub = commands.add_parser(name)
        sub.add_argument('--output', type=Path, required=True)
        if name == 'defer':
            sub.add_argument('--reason', required=True)
        if name == 'resume':
            sub.add_argument('--quality', choices=tuple(SPEC['quality_tiers']))
        if name == 'record-image':
            sub.add_argument('--image', type=Path, required=True)
        if name == 'review':
            sub.add_argument('--checklist', type=Path, required=True)
    args = parser.parse_args()
    if args.command in ('status', 'defer', 'resume', 'record-image', 'review'):
        return manage_asset(args)
    if args.command == 'presets':
        print(json.dumps({k:v['label'] for k,v in PRESETS.items()}, ensure_ascii=False, indent=2))
        return 0
    if args.command == 'verify-image':
        tier = SPEC['quality_tiers'][args.quality]
        result = inspect_image(args.image, [tier['width'], tier['height']])
        print(json.dumps(result))
        return 0 if result['pixel_check_passed'] else 1
    if not args.brief.strip() or len(args.brief) > 12000:
        raise ValueError('简述必须为 1–12000 字符')
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError('输出目录非空，请选择新的目录以保留历史版本')
    raw_settings = dict(PRESETS[args.preset]['settings']) if args.preset else {}
    if args.settings:
        explicit_settings = json.loads(args.settings.read_text())
        if not isinstance(explicit_settings, dict):
            raise ValueError('设置必须是 JSON 对象')
        raw_settings.update(explicit_settings)
    if args.show_info:
        raw_settings['show_info'] = True
    if args.quality:
        raw_settings['quality'] = args.quality
    settings = settings_for(raw_settings)
    cast = load_cast(args.cast)
    data = json.loads(args.content.read_text()) if args.content else expand(args.brief, settings, args.model, cast)
    validate_content(data)
    validate_differences(data, cast)
    validate_project_character(data, settings)
    prompt, negative = compose(args.brief, settings, data, args.name)
    args.output.mkdir(parents=True, exist_ok=True)
    def save(name, value):
        (args.output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    save('character.json', data)
    save('asset.json', {'name': args.name, 'fingerprint': data['fingerprint'], 'basic_info': {'age': settings.get('age') or data.get('basic_info', {}).get('age', '年龄未设定'), 'gender': settings.get('gender') or data.get('basic_info', {}).get('gender', '')}})
    save('cast-comparison.json', {'comparisons': data.get('cast_comparison', []), 'status': 'text_design_checked_visual_review_required'})
    save('generation-request.json', {'status': 'awaiting_image_generation', 'tool': 'image_gen', 'prompt': prompt + '\n【负向约束】\n' + negative, 'expected_size': [settings['image_width'],settings['image_height']], 'brief': args.brief, 'settings': settings, 'text_source': 'supplied_content' if args.content else args.model})
    save('review-checklist.json', {'checks': {k: False for k in REVIEW_ITEMS}, 'notes': '待实际看图填写；未检查项保持false，不得批量默认通过'})
    save('cast-input.json', cast)
    (args.output / 'prompt.txt').write_text(prompt)
    (args.output / 'negative.txt').write_text(negative)
    print('已保存结构化提示词与待出图请求: ' + str(args.output.resolve()))
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, KeyError, OSError, TypeError) as exc:
        print('错误: ' + str(exc), file=sys.stderr)
        sys.exit(2)
