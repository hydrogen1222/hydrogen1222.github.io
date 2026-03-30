---
title: Gentoo初体验
date: 2025-12-12 22:36:14
categories:
  - 计算机科学与技术？
tags:
  - 折腾
  - Linux
cover: cover.png
---
周日闲着心血来潮，看看远处的`Gentoo`，这篇博文也当成长期更新的记录贴吧，只针对于`AMD 64`架构，just keep learning!

# 安装

## 引导进入安装镜像

与其他发行版一样，`Gentoo`安装也需要一个启动镜像，有纯命令行的最小化安装CD和`Gentoo LiveGUI`两种，我选择前者。这个镜像可以方便地使用`Ventoy`进行引导，**但仅仅是一个安装媒介而已**。

引导时我选择默认地`gentoo`内核，除此外还有一个`gentoo-nofb`，nofb即no framebuffer，它让内核和用户态程序通过一个统一的设备文件（通常是 `/dev/fb0`）直接访问显卡的显存，从而在不依赖 X server 或 Wayland 之类图形系统的情况下，也能在控制台显示图形、字体、图片，甚至跑一些简单的图形程序。

安装时可以用另一台机器远程`ssh`链接，一边查wiki一边安装，复制粘贴什么的都很方便。然鹅我没有多余的机子，手敲长串的命令行，屏幕还没驱动默认最大亮度，就很坐牢。

## 配置网络

`gentoo`的安装是需要网络的，如果计算机使用网线连接到IPv6路由或DHCP路由器，那么安装镜像一般是可以自动连接网络的。如果没有路由器只有个光猫，需要pppoe拨号上网，具体参考wiki。用安卓手机通过数据线连接至电脑，启用USB网络共享模式大概也是可行的。

使用WiFi连接网络也是可行的，可以使用`net-setup`工具，参考wiki

## 磁盘分区

这一步可以在先前已有的系统上进行，实在不行在pe系统里进行也可以，更直观更不容易出错，并且Linux自带的`cfdisk`工具和`diskgenius`之类的软件的操作逻辑有些不同。数据无价，谨慎更改！

2025年了，legacy BIOS逐渐消亡，GUID(GPT)表早已成为主流。我大概分了三个区：根分区、与Windows共用的EFI分区、Swap分区

使用`fdisk -l`命令查看磁盘设备，如果不是用ssh连接的，消息过多，可能会无法看到部分信息，此时也可以使用`lsblk`命令查看。

分好区之后接着将分区格式化为Linux适用的文件系统。俗话说：人生苦短，远离`Gentoo`😇。`Gentoo`是纯手动档，大量的软件包需要自己编译，这可能会对磁盘进行较多的高速I/O读写，笔者了解的文件系统类型也不多：

- xfs
- btrfs
- ext4(以及过去的ext3,ext2)
- zfs
- f2fs

我选择了xfs，它在高速IO读写方面略胜一筹，接下来是格式化：

```bash
mkfs.xfs /dev/nvmexnxpx
```

EFI分区由于是共用的，不用格式化，接下来开启swap分区：

```bash
mkswap /dev/nvmexnxpx
```

接下来挂载分区：

```bash
mkdir --parents /mnt/gentoo
mount /dev/nvmexnxpx /mnt/gentoo
```

wiki推荐挂载EFI分区到/efi，我已经习惯了挂载到/boot/efi

```
mkdir --parents /mnt/gentoo/boot/efi
mount /dev/nvmexnxpx /mnt/gentoo/boot/efi
```

## 安装基本的系统环境

安装镜像提供了一个**临时的基本系统环境**，带有内核、常用工具（bash、fdisk、wget…），让你能进入一个命令行环境进行磁盘分区、下载文件等操作。它不是最终系统，只是“施工工具”。接下来需要下载stage3文件，这是一个 **预编译好的基础系统**，是一个能开机、能用 `chroot` 进去的最小 Linux 用户空间环境，里面已经有：

- C 库（glibc 或 musl）
- 编译器（gcc 或 clang）
- 核心工具链（binutils、bash、coreutils、portage …）

有了 stage3，就能在 chroot 里运行 `emerge` 去拉源码并编译其余的软件。

stage3文件类型多种多样，我选择了最省事最习惯的使用systemd和multilib的stage3文件。

首先进入挂载位置/mnt/gentoo，然后设置时间，这个很关键，因为Stage 存档通常使用 HTTPS 获取，这需要相对准确的系统时间。

```bash
chronyd -q
```

使用命令行浏览器下载stage3文件：

```bash
links https://www.gentoo.org/downloads/mirrors/
```

进入后选择Asia源中的CN，即中国镜像源，选择合适的镜像站点后进入`releases/amd64/autobuilds/`目录，选中合适的stage3文件，按`d`键开始下载，一般下载没什么问题。

接着解压包：

```bash
tar xpvf stage3-*.tar.xz --xattrs-include='*.*' --numeric-owner -C /mnt/gentoo
```

`Gentoo`系统是需要编译的，因此接下来配置的编译选项也是非常重要的。

编译选项配置文件是`/mnt/gentoo/etc/portage/make.conf`，下面是一个示例：

```
# These settings were set by the catalyst build script that automatically
# built this stage.
# Please consult /usr/share/portage/config/make.conf.example for a more
# detailed example.
COMMON_FLAGS="-march=znver4 -O3 -pipe -fomit-frame-pointer -flto=thin"
CFLAGS="${COMMON_FLAGS}"
CXXFLAGS="${COMMON_FLAGS}"
FCFLAGS="${COMMON_FLAGS}"
FFLAGS="${COMMON_FLAGS}"
RUSTFLAGS="-C target-cpu=native -C opt-level=3 -C codegen-units=1 -C lto"
MAKEOPTS="-j20"


# NOTE: This stage was built with the bindist USE flag enabled

# This sets the language of build output to English.
# Please keep this setting intact when reporting bugs.
LC_MESSAGES=C.utf8
```

CFLAGS 和 CXXFLAGS 变量分别定义了GCC C和C ++编译器的优化标志，详细信息在GNU在线手册中。

## 编译安装基础系统

接下来就是`chroot`到stage3所带的基础编译环境，开始编译新的系统，在这之前需要：

```bash
cp --dereference /etc/resolv.conf /mnt/gentoo/etc/
```

以此确保`chroot`后网络仍然可用，接下来：

```bash
arch-chroot /mnt/gentoo
source /etc/profile
export PS1="(chroot) ${PS1}"
```

至此，我们已经进入了stage3所带的基础编译环境，也是根分区。接下来挂载EFI分区：

```bash
mount /dev/nvmexnxpx /boot/efi
```

然后选择合适的镜像源：

```bash
emerge --ask --verbose --oneshot app-portage/mirrorselect
mirrorselect -i -o >> /etc/portage/make.conf
```

然后执行：

```bash
emerge-webrsyn
```

`Gentoo`的软件包源`rsyn`和`git`两种方式，可以方便时换成后者。

接下来选择合适的配置文件，我选择了`plasma`桌面且带有`systemd`，使用`eselect profile list`查看所有的配置文件，使用`eselect profile set 2`选择相应的配置文件。

也有部分二进制软件包来自官方，参考wiki，然而我拒绝🤪。

接下来是USE变量的设置，这非常重要，它控制了编译时是否加入/删除对某些功能的支持，比如说`-gtk`就是删除所有编译后的包对gtk的支持，他也是在`/mnt/gentoo/etc/portage/make.conf`中进行配置

```bash
USE="
# 桌面环境 & UI
X wayland kde plasma egl gles2 gtk gtk2 gtk3 gtk4 qt4 qt5 qt6
xinerama xrandr xcomposite xcursor
opengl vulkan vaapi vdpau drm

# 音频
alsa pulseaudio pipewire sound server dbus
jack -oss

# 视频/图像
jpeg png gif tiff webp heif
ffmpeg theora x264 x265
av1 vpx opencl openmp

# 输入法/语言
icu nls l10n_zh l10n_en
freetype fontconfig
xim ibus

# 网络
ssl tls http2 curl
samba smbclient
ssh bluetooth wifi networkmanager
dns ipv6 zeroconf

# 游戏相关
steam vulkan opengl sdl sdl2
gamepad joystick

# 文件压缩/格式
zlib bzip2 lzma lzo zstd
archive rar zip 7zip

# 开发/脚本语言支持
python ruby perl lua
jit jit-lua

# 其他通用优化
threads multilib
udev udisks upower
policykit systemd
"
```

接下来设置`CPU_FLAGS_*`，这是给 ebuild 提供 CPU 指令集信息的，不同包会根据这些 flag 决定是否启用 SIMD 优化。

```bash
emerge --ask --oneshot app-portage/cpuid2cpuflags
cpuid2cpuflags
echo "*/* $(cpuid2cpuflags)" > /etc/portage/package.use/00cpu-flags
```

在`/etc/portage/make.conf`设置显示卡：

```bash
VIDEO_CARDS="amdgpu radeonsi vdpau vaapi"
```

娱乐用户直接大开：

```bash
ACCEPT_LICENSE="*"
```

更新系统：

```bash
emerge --ask --verbose --update --deep --newuse @world
```

设置时区：

```bash
ls /usr/share/zoneinfo
ls -l /usr/share/zoneinfo/Europe/
ln -sf ../usr/share/zoneinfo/Europe/Brussels /etc/localtime
```

设置本地化：

```bash
echo 'zh_CN.UTF-8 UTF-8' >> /etc/locale.gen
echo 'en_US.UTF-8 UTF-8' >> /etc/locale.gen
locale-gen
```

安装固件、微码：

```bash
emerge --ask sys-kernel/linux-firmware
```

安装内核：

```bash
sys-kernel/installkernel
```

安装引导程序，创建文件`/etc/portage/package.use/installkernel`

```bash
sys-kernel/installkernel grub
```

接着：

```bash
emerge --ask sys-kernel/installkernel
```

## 配置系统

创建fstab！！！

设置主机名：

```bash
echo storm > /etc/hostname
hostnamectl hostname storm
```

安装dhcpcd并启用：

```bash
emerge --ask net-misc/dhcpcd
systemctl enable dhcpcd
```

创建hosts文件

设置root密码

## 收尾

将`GRUB_PLATFORMS="efi-64"`加如`/etc/portage/make.conf`

```bash
echo 'GRUB_PLATFORMS="efi-64"' >> /etc/portage/make.conf
emerge --ask sys-boot/grub
grub-install --target=x86_64-efi --efi-directory=/efi
```

创建一个普通用户：

```bash
useradd -m -G users,wheel,audio -s /bin/bash storm
passwd storm
```

添加sudo权限



#### 内核选择

- gentoo

  默认内核，支持K8 CPU（包括NUMA支持）和EM64T CPU。

- gentoo-nofb

  与“gentoo”相同，但没有framebuffer支持。