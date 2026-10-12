# literature-prose-editor

一个给 Pi / Agent Skills 使用的科研笔记编辑 Skill。

目标：把 Obsidian 里零散、乱序、重复、充满 bullet 和临时想法的文献/科研笔记，整理成**平和温暖、自然连贯、但技术细节严谨的中文博客式笔记**。

## 安装

### 方案 A：只给当前 Obsidian Vault 使用（推荐）

把整个 `literature-prose-editor` 目录复制到：

```text
你的 Vault/
└── .pi/
    └── skills/
        └── literature-prose-editor/
            ├── SKILL.md
            └── references/
```

然后在 Vault 根目录启动 Pi：

```bash
cd /path/to/your/Obsidian-Vault
pi
```

调用：

```text
/skill:literature-prose-editor
```

### 方案 B：全局安装

复制到：

```text
~/.pi/agent/skills/literature-prose-editor/
```

这样在不同项目里都可以使用。

## 最懒用法

```text
/skill:literature-prose-editor

把 Thermostat/ 里和扩散有关的笔记整理成一篇能从头读到尾的中文笔记。
```

或者：

```text
/skill:literature-prose-editor

整理 `Basconi2013.md`，别给我写成提纲，保留我的疑问、emoji、公式和文献细节。
```

甚至可以只说：

```text
/skill:literature-prose-editor

把这几篇弄顺一点，写得像人写的 😂
```

Skill 会自行判断是单篇重组、多篇融合还是仅润色。

## 更精确的用法

### 多篇融合

```text
/skill:literature-prose-editor

读取：
- notes/CSVR.md
- notes/NHC.md
- notes/Basconi2013.md
- results/thermostat-test.md

整理为 `恒温器、动力学与扩散.md`。
核心问题是：为什么 thermostat 的热力学采样正确，不代表输运动力学一定可靠？
不要摘要，尽量保留技术细节。
```

### 回查已有整理稿

```text
/skill:literature-prose-editor

用原始笔记回查 `恒温器、动力学与扩散.md`：
重点检查有没有漏掉数字、公式、限定条件、citation，以及有没有把“可能”写成“确定”。
只修改确有问题的地方。
```

### 原地修改

Skill 默认保护源文件。如果确定要覆盖：

```text
/skill:literature-prose-editor

直接原地整理 `xxx.md`，允许覆盖这个文件。
```

## 设计偏好

这个 Skill 特别压制：

- `## / ###` 过密；
- bullet-list 海洋；
- “首先其次此外综上所述”；
- “概述—优点—缺点—总结”模板；
- 过度摘要；
- 把个人探索全部洗成教科书腔；
- 把不确定结论擅自写得更确定。

同时特别保护：

- 数字与单位；
- 公式；
- 文献引用；
- Obsidian wikilink；
- 技术限定条件；
- 用户自己的疑惑、实验观察和自然 emoji。

## 一个建议

如果这个 Skill 用一阵子后，你发现某种句式仍然很烦，最有效的改法通常不是换模型，而是把那类“坏例子 → 好例子”继续追加到 `references/EXAMPLES.md`。

久而久之，它会越来越贴近你自己的笔记习惯。
