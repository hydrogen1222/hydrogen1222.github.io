---
title: Hermes Agent尝鲜
date: 2026-04-17 10:36:14
categories:
  - 计算机科学与技术？
tags:
  - 折腾
cover: cover.png
---
之前一百多捡了一台小主机，安装的`CatOS`，基于`Arch Linux`的发行版，准备养龙虾的，结果部署好了发现非常难用，最近`Hermes Agent`挺火热的，来试试水。
如图，配置真挺差的，用的ssh远程访问：
```bash
storm-tobefilledbyoem# fastfetch
        #####            root@storm-tobefilledbyoem
       #######           --------------------------
       ##O#O##           OS: CatOS x86_64
       #######           Kernel: Linux 6.19.10-arch1-1
     ###########         Uptime: 17 mins
    #############        Packages: 1131 (pacman)
   ###############       Shell: zsh 5.9
   ################      Display (A24FAA-RG): 1920x1080 in 24", 60 Hz [External]
  #################      Terminal: /dev/pts/1 10.2p1
#####################    CPU: Intel(R) Celeron(R) N2820 (2) @ 2.13 GHz
#####################    GPU: Intel Atom Processor Z36xxx/Z37xxx Series Graphics & Display @ 0.76 GHz [Integrated]
  #################      Memory: 2.41 GiB / 3.70 GiB (65%)
                         Swap: 776.80 MiB / 8.15 GiB (9%)
                         Disk (/): 25.21 GiB / 215.02 GiB (12%) - xfs
                         Local IP (enp1s0): 192.168.1.111/24
                         Locale: zh_CN.UTF-8
```

最近有AMD的小主机大船靠岸，也是差不多的价格，现在想来好后悔，亏麻了🤣
首先安装，需要使用网络代理：
```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
```
