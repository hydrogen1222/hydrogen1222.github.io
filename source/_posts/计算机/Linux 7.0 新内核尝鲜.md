---
title: Gentoo 纯手工折腾笔记：使用 LLVM 编译 Linux 7.0-rc1 尝鲜全纪录
date: 2026-02-28 20:00:00
tags:
  - Gentoo
  - 折腾
cover:
---

Linus Torvalds 在 2 月 22 日正式发布了 **Linux 7.0-rc1**。作为从 6.19 跨越过来的全新大版本号，虽然底层没有推倒重来，但诸如 TSE 时间片延长（大幅优化桌面和游戏 1% Low 帧率）、Rust 彻底转正以及史诗级的内存管理提速，都让人无比手痒。

作为折腾爱好者，我不太想苦等 Portage 树的更新，干脆直接从 Kernel.org 拉取原汁原味的源码，并且抛弃 GCC，全程使用 LLVM 工具链来进行一次纯手工编译。

以下是为这台 AMD Ryzen 7 7840HS 机器定制 7.0-rc1 专属内核的全过程。

## 准备工作：拉取官方源码

在 Gentoo 中，将源码统一放在 `/usr/src` 目录下。

```bash
cd /usr/src
# 从上游直接拉取 7.0-rc1 源码包
sudo wget [https://git.kernel.org/torvalds/t/linux-7.0-rc1.tar.gz](https://git.kernel.org/torvalds/t/linux-7.0-rc1.tar.gz)

# 解压并建立标准软链接
sudo tar -xzvf linux-7.0-rc1.tar.gz
sudo ln -sfn linux-7.0-rc1 linux
cd linux

# 深度清理源码树（引入 LLVM 规则）
sudo make LLVM=1 mrproper

```

## 核心步骤：配置迁移与避坑指南

为了保证稳定性，我决定继承之前系统稳定运行的老内核配置（`.config`）。但在迁移过程中，有两个大坑需要提前避开！

### 避坑 1：清除 Portage 的“幽灵证书”

之前的配置是基于 `gentoo-kernel` 生成的，`.config` 里会残留 Portage 临时目录下的模块签名证书路径（例如 `/var/tmp/portage/.../kernel_key.pem`）。直接编译会在最后阶段报出 `没有规则可制作目标` 的致命错误。

**解决方法：** 使用 `sed` 批量清空这些绝对路径，让内核在当前目录自动生成新证书。

```bash
# 将老配置拷贝过来
sudo cp ~/backup.config ./.config

# 清理过期的密钥路径
sed -i 's/CONFIG_SYSTEM_TRUSTED_KEYS=".*"/CONFIG_SYSTEM_TRUSTED_KEYS=""/' .config
sed -i 's/CONFIG_SYSTEM_REVOCATION_KEYS=".*"/CONFIG_SYSTEM_REVOCATION_KEYS=""/' .config
sed -i 's/CONFIG_MODULE_SIG_KEY=".*"/CONFIG_MODULE_SIG_KEY="certs\/signing_key.pem"/' .config
```

### 避坑 2：打造专属的内核后缀名

老的配置文件里通常带有 `-gentoo-dist` 这样的后缀。既然是纯手工用 LLVM 搓出来的内核，当然要有自己的专属签名。

可以直接用 `sed` 修改，把后缀改成我自己的 `-storm-llvm`：

Bash

```
sed -i 's/CONFIG_LOCALVERSION=".*"/CONFIG_LOCALVERSION="-storm-llvm"/' .config
```

做完这些，执行一条命令自动补全新版本新增的配置项：
```bash
sudo make LLVM=1 olddefconfig
```
## 火力全开：LLVM 狂暴编译

一切就绪，核心技巧就是在所有的 `make` 命令后面加上 `LLVM=1`。这会调用 Clang 和 LLD 替代传统的 GCC 工具链。

```bash
# 查看当前 LLVM 工具链版本
clang --version

# 开始编译（-j 自动获取所有 CPU 线程数）
sudo make LLVM=1 -j$(nproc)
```

静待编译完成。

## 部署与 Initramfs 生成

编译完成后，依次安装模块和内核核心文件：
```bash
sudo make LLVM=1 modules_install
sudo make LLVM=1 install
```

## 更新GRUB
最后一步，让 GRUB 重新扫描 `/boot` 目录，识别我们的内核：
```bash
sudo grub-mkconfig -o /boot/grub/grub.cfg
sudo reboot
```

