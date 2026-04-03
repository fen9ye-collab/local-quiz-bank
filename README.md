# 本地 HTML 题库

这是一个免服务器的前端题库页面，直接打开 [index.html](/D:/Project/local-quiz-bank/index.html) 就能用。

## 使用方式

1. 用手机或电脑打开 `index.html`
2. 点击“选择题库目录”
3. 第一次授权同级的 `questions` 文件夹
4. 之后刷新页面时，浏览器会尝试记住并重新读取这个目录
5. 勾选章节开始练习，或进入错题库练习

错题库数据会保存在当前浏览器本地，不会因为普通刷新而丢失。

## 题库目录

建议把所有题库 JSON 放在 [questions](/D:/Project/local-quiz-bank/questions) 目录下。

支持一个目录内多个 `.json` 文件，页面会按文件名顺序读取。

## 题库 JSON 规范

推荐一个文件对应一个章节：

```json
{
  "chapter": "第一章 呼吸系统",
  "questions": [
    {
      "id": "single-001",
      "prompt": "下列哪项最符合单选题示例？",
      "options": [
        { "key": "A", "text": "选项A" },
        { "key": "B", "text": "选项B" }
      ],
      "answer": "B",
      "analysis": "单选题只允许一个正确答案。"
    }
  ]
}
```

也支持：

```json
[
  { "id": "single-001", "chapter": "第一章", "prompt": "..." }
]
```

或：

```json
{
  "chapters": [
    {
      "name": "第一章",
      "questions": [{ "id": "single-001", "prompt": "..." }]
    }
  ]
}
```

## 四种题型写法

### 单选题

```json
{
  "id": "single-001",
  "prompt": "下列哪项最符合单选题？",
  "options": [
    { "key": "A", "text": "选项A" },
    { "key": "B", "text": "选项B" },
    { "key": "C", "text": "选项C" },
    { "key": "D", "text": "选项D" }
  ],
  "answer": "B",
  "analysis": "这里只能有一个正确答案。"
}
```

### 多选题

`answer` 可以写成数组，也可以写成 `"BC"`。系统会按答案个数自动识别为多选题。

```json
{
  "id": "multi-001",
  "prompt": "下列哪些属于多选题正确写法？",
  "options": [
    "A. 只有一个答案",
    "B. 可以有多个答案",
    "C. 错选或漏选都算错",
    "D. 系统不会自动判断"
  ],
  "answer": ["B", "C"],
  "analysis": "答案超过 1 个时会自动按多选题处理。"
}
```

### 共用题干题

建议明确写 `type: "sharedStem"`。该题型下每个子题都应为单选题。只要任何一问答错，整个题组进入错题库。

```json
{
  "id": "shared-001",
  "type": "sharedStem",
  "stem": "患者女，28岁，发热伴咽痛3天。",
  "questions": [
    {
      "id": "shared-001-1",
      "prompt": "首选诊断考虑是",
      "options": ["A. 急性咽炎", "B. 急性胃炎", "C. 鼻炎", "D. 中耳炎"],
      "answer": "A"
    },
    {
      "id": "shared-001-2",
      "prompt": "首选处理措施是",
      "options": ["A. 多饮水休息", "B. 立即手术", "C. 长期禁食", "D. 不处理"],
      "answer": "A"
    }
  ]
}
```

### 案例题

建议明确写 `type: "case"`。案例中的每个子题可以是单选，也可以是多选。只要任何一问错选或漏选，整个案例进入错题库。

```json
{
  "id": "case-001",
  "type": "case",
  "stem": "【案例24】鼻阻塞症状：患者男，55岁，进行性鼻阻塞伴鼻出血。",
  "questions": [
    {
      "id": "case-001-1",
      "prompt": "目前可行的辅助检查包括",
      "options": ["A. 鼻部X线检查", "B. 鼻窦或头颅CT/MRI", "C. 胸部CT", "D. 鼻镜检查", "E. 鼻咽镜或鼻内镜检查", "F. 骨髓检查", "G. 病理检查"],
      "answer": ["B", "C", "D", "E", "G"]
    },
    {
      "id": "case-001-2",
      "prompt": "EB病毒VCA-IgA升高，应考虑的诊断是",
      "options": ["A. 过敏性鼻炎", "B. 萎缩性鼻炎", "C. 慢性鼻窦炎", "D. 鼻息肉", "E. 鼻中隔偏曲", "F. 鼻咽癌"],
      "answer": "F"
    }
  ]
}
```

## 当前功能

- 按章节顺序练习
- 单选、多选、案例题、共用题干题
- 手动加入错题库后自动跳下一题
- 只有答错时显示解析
- 错题库单独练习
- 错题答对后自动释放
- 错题保存在当前浏览器本地
