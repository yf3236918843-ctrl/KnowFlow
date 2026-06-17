p = "D:/FIles/documents/Project FIles/PT/Project/core/prompt_manager/prompts/calculus/tutor/prompt.txt"
with open(p, 'r', encoding='utf-8') as f:
    c = f.read()

old = "学生正在做来自{QuestionSource}的习题:{Question}。\n\n## 教学规则"
new = """学生正在做来自{QuestionSource}的习题:{Question}。
--{-/* QuestionSource: 题目来源名称，如"同济高数习题册" */-}--
--{-/* Question: 当前题目的完整文本内容 */-}--

## 教学规则"""

if old in c:
    c = c.replace(old, new)
    # Add UserPicture comment
    c = c.replace(
        "{UserPicture}\n\n## 辅导的偏好",
        "{UserPicture}\n--{-/* UserPicture: 用户画像概要信息，如"该生擅长极限计算，导数部分薄弱" */-}--\n\n## 辅导的偏好"
    )
    # Add profile comment
    c = c.replace(
        "{profile}\n\n## 输出格式说明",
        "{profile}\n--{-/* profile: 用户的教学偏好列表，如"- 先引导后讲解（x3）" */-}--\n\n## 输出格式说明"
    )
    with open(p, 'w', encoding='utf-8') as f:
        f.write(c)
    print("OK")
else:
    print("NOT FOUND")
    idx = c.find("学生正在做")
    print(repr(c[idx:idx+100]))
