---
title: Stormy-drawing绘图skill已发布
date: 2026-10-12 22:22:00
tags:
  - 折腾
  - AI
  - 科研
cover:
---
个人绘图skill已经发布，创作者：
- Storm Talia
- Opus 5.5
- Sonnet 5.5

创作动机来源于对绘图的苦恼，受够了Origin卡顿的操作，再加上本人也菜（主要原因😂），索性转向使用python绘图。目前agent大爆发，很容易创作skill，本人也没有找到满意的绘图的skill，遂开发自己的个人绘图skill。主要是为了代替origin，设计重点包括坐标轴、字体（默认使用Arial，Linux上需要上传字体）、画布等，仓库在：
- https://github.com/hydrogen1222/Stormy-drawing

效果见下图：
![[Pasted image 20261012222642.png]]![[Pasted image 20261012222656.png]]![[Pasted image 20261012222700.png]]![[Pasted image 20261012222731.png]]![[Pasted image 20261012222736.png]]
python个人习惯是用`uv`管理（如果你只用python的话其实完全没必要是用miniconda甚至anaconda，可以使用uv等轻量化、现代化的包管理器），在Windows上使用需要允许是用PowerShell脚本。模型推荐是用有多模态的，原生agent推荐：
- Codex
- dsh web或者dsh-tui
- antigravity
当然转接也行，有多模态能力可能方便测试调整。