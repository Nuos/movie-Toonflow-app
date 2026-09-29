"""JSON stdin adapter; uses the pinned skill's validator and deterministic compiler."""
import json
import hashlib
from pathlib import Path
import re
import sys
import turnaround as t


def run(raw):
    allowed = {'name', 'brief', 'settings', 'character', 'cast', 'generate'}
    if not isinstance(raw, dict) or set(raw) - allowed:
        raise ValueError('未知角色文档字段')
    for key in ('name', 'brief'):
        if not isinstance(raw.get(key), str) or not raw[key].strip():
            raise ValueError(key + ' 必须为非空文本')
    settings = t.settings_for(raw.get('settings', {}))
    cast = raw.get('cast', [])
    if not isinstance(cast, list) or len(cast) > 30:
        raise ValueError('角色对照最多30项')
    for asset in cast:
        t.validate_fingerprint(asset.get('fingerprint'))
    data = t.expand(raw['brief'], settings, 'deepseek-flash', cast) if raw.get('generate') else raw.get('character')
    t.validate_content(data)
    if set(data) != {'sections', 'assumptions', 'negative', 'fingerprint', 'cast_comparison', 'basic_info'}:
        raise ValueError('角色文档必须且只能包含模板的六个字段')
    if not isinstance(data['basic_info'], dict) or set(data['basic_info']) != {'age', 'gender'}:
        raise ValueError('basic_info 必须包含 age 与 gender')
    for key in ('age', 'gender'):
        if not isinstance(data['basic_info'][key], str) or not data['basic_info'][key].strip():
            raise ValueError('年龄和性别不得为空')
        if settings.get(key) and settings[key] != data['basic_info'][key]:
            raise ValueError(key + ' 与明确设置冲突，请同步修改角色文档')
    t.validate_differences(data, cast)
    t.validate_project_character(data, settings)
    for value in data['sections'].values():
        if re.search(r'【|】|2\s*[×xX]\s*2|从左至右.*栏|四人合影|四个全身', value):
            raise ValueError('角色章节不能覆盖固定四视图布局或插入模板标题')
    body = data['sections']['体型与比例']
    for value, unit in re.findall(r'(\d+(?:\.\d+)?)\s*(cm|厘米|公分|米)', body):
        if t.height_cm(value + unit) != t.height_cm(data['fingerprint']['height']):
            raise ValueError('体型章节身高与身份锚点不一致，请同步修改')
    ratios = re.findall(r'\d+(?:\.\d+)?(?=\s*头身)', body)
    expected_ratio = re.search(r'\d+(?:\.\d+)?', data['fingerprint']['head_body_ratio'])
    if expected_ratio and any(float(v) != float(expected_ratio[0]) for v in ratios):
        raise ValueError('体型章节头身比与身份锚点不一致，请同步修改')
    for key in ('head_body_ratio', 'face_structure', 'facial_features', 'hair'):
        if settings.get(key) and settings[key] != data['fingerprint'][key]:
            raise ValueError(key + ' 与身份锚点冲突，请同步修改角色文档')
    prompt, negative = t.compose(raw['brief'], settings, data, raw['name'])
    # The original brief remains in the revision archive, never competing with
    # subsequently edited fields (e.g. an old costume colour) in the image prompt.
    prompt = prompt.replace('【用户原始设定】\n' + raw['brief'] + '\n',
                            '【角色设定依据】\n以以下已确认字段与身份锚点为唯一角色设计依据。\n', 1)
    if settings['quality'] == '1080p':
        prompt = prompt.replace('原生1920×1080像素', '交付1920×1080像素（本地模型内部1920×1088，上下各裁4像素，不缩放；头脚保留安全边距）', 1)
    # Give layout priority over the long design description. Keep the source
    # layout verbatim and all character fields; never summarize away edits.
    layout = re.search(r'【画面布局】\n.*?(?=【)', prompt, re.S).group(0)
    prompt = prompt.replace(layout, '', 1)
    first, rest = prompt.split('\n', 1)
    nose = '左' if settings['side'] == 'left' else '右'
    framing = ('【四栏构图锁定】\n整张图恰好四个视图，单行排列。'
               f'最左{settings["portrait_fraction"]:.0%}宽度是一张放大的正面脸部特写，只画头顶到锁骨；'
               '这张脸明显大于右边三个全身像的脸。右边依次仅有三个等大、互不重叠的小全身像：'
               f'正面、鼻尖朝{nose}的严格侧面、纯背面。'
               '三个全身像都从头顶到鞋底完整入画，头顶与脚底分别对齐；两侧及上下留空隙。'
               '整张人物轮廓总数为四：一个大头像加三个小全身。\n')
    prompt = first + '\n' + framing + layout + rest
    # Keep every fingerprint in the compiled text. The skill controls all layout fields.
    full = prompt + '\n【负向约束】\n' + negative
    if len(full) > 40000:
        raise ValueError('完整提示词超过本地图像模型40000字上限')
    return {'name': raw['name'], 'brief': raw['brief'],
            'settings': {k: v for k, v in settings.items() if k in t.FIELDS or k in ('template', 'side', 'portrait_fraction', 'show_info', 'quality')},
            'character': data, 'cast': cast, 'prompt': full,
            'width': settings['image_width'], 'height': settings['image_height'],
            'templateVersion': 'female-portrait-director/2.1-toonflow.3',
            'compilerHash': hashlib.sha256(Path(__file__).read_bytes() + Path(t.__file__).read_bytes() + (t.ROOT / 'skill/turnaround/template.json').read_bytes()).hexdigest()}


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, 'data': run(json.load(sys.stdin))}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False))
        sys.exit(1)
