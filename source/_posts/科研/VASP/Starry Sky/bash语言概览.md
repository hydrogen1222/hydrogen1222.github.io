---
title: bash语言概览
date: 2026-04-12 14:48
tags:
  - 化学
  - 科研
categories:
  - 计算机科学与技术？
cover: cover.png
---
远在天边，近在眼前，熟悉shell（bash、fish），却又从未真正深入了解过，借此机会学习一下吧~
```bash
#!/usr/bin/env bash
set -euo pipefail #严格模式，任何命令失败（返回非0）则立即退出脚本

BUNDLE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BUNDLE_ROOT"

TEMPERATURES="${TEMPERATURES:-600 700 800}" #如果未定义或为空，则使用默认值600,700,800
STEPS="${STEPS:-20000}"#如果未定义或为空，则使用默认值2000
SAVE_INTERVAL="${SAVE_INTERVAL:-100}"#每特定步数保存一次轨迹/数据
STRUCTURES="${STRUCTURES:-bulk_ordered gb_Sigma3_t3 gb_Sigma3_t3_Li_vac_c1_s1}"

echo "[INFO] bundle_root      = $BUNDLE_ROOT"
echo "[INFO] temperatures_K  = $TEMPERATURES"
echo "[INFO] steps           = $STEPS"
echo "[INFO] save_interval   = $SAVE_INTERVAL"
echo "[INFO] structures      = $STRUCTURES"

for structure_id in $STRUCTURES; do
  for temp in $TEMPERATURES; do
    echo
    echo "[RUN] structure=$structure_id temp=${temp}K steps=$STEPS"
    MD_TEMP="$temp" \
    MD_STEPS="$STEPS" \
    MD_SAVE_INTERVAL="$SAVE_INTERVAL" \
    bash 03_scripts/run_md_single.sh "$structure_id"
  done
done

echo
echo "[DONE] conductivity batch finished"
```

`shell`是一个用C语言编写的程序，它是用户使用 Linux 的桥梁，既是一种命令语言，又是一种程序设计语言。
Linux的shell众多，包括：
- Bourne Shell（/usr/bin/sh或/bin/sh）
- Bourne Again Shell（/bin/bash）
- C Shell（/usr/bin/csh）
- K Shell（/usr/bin/ksh）
- Shell for Root（/sbin/sh）
我们重点关注`bash`。
脚本的第一行，`#!`是一个约定的标记，它告诉系统这个脚本需要什么解释器来执行，即使用哪一种 Shell。
shell变量的定义：
```bash
your_name="x"
```
需要注意：
- ==变量名和等号之间不能有空格==
- 不能以数字开头
- 不允许使用关键字
- 习惯使用大写字母表示常量
- 空格通常用于分隔命令和参数，因此避免使用空格
使用一个定义过的变量，只要在变量名前面加美元符号$即可。
只读变量`readonly`：
```bash
myURL="https://hydrogen1222.com.cn"
readonly myURL
```
使用`unset`命令可以删除变量，但不可以删除只读变量：
```bash
unset variable_name
```


`${BASH_SOURCE[0]}`是一个特殊shell变量，指当前执行的脚本文件路径
`$PWD`指定当前所在的目录
`${VAR:-default}`：如果变量 `VAR` 未设置或为空，使用默认值
