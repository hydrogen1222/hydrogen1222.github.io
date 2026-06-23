---
title: 各家厂商的大模型API对比
date: 2026-06-21 11:36:14
categories:
  - 计算机科学与技术？
tags:
  - 折腾
cover: cover.png
---


|     厂商      |                           模型                            | 输入价格(缓存命中\|缓存未命中，单位¥) | 输出价格 |          备注          |
| :---------: | :-----------------------------------------------------: | :-------------------: | :--: | :------------------: |
| Moonshot AI |                        kimi-k2.5                        |        0.7\|4         |  21  |                      |
| Moonshot AI |                        kimi-k2.6                        |       1.1\|6.5        |  27  |                      |
| Moonshot AI |                     kimi-k2.7-code                      |       1.3\|6.5        |  27  |                      |
| Moonshot AI |                kimi-k2.7-code-highspeed                 |        2.6\|13        |  54  |                      |
| Moonshot AI |                     moonshot-v1-8k                      |           2           |  10  |       通用大模型基座？       |
| Moonshot AI |                     moonshot-v1-32k                     |           5           |  20  |       通用大模型基座？       |
| Moonshot AI |                    moonshot-v1-128k                     |          10           |  30  |       通用大模型基座？       |
| Moonshot AI |              moonshot-v1-8k-vision-preview              |           2           |  10  |       通用大模型基座？       |
| Moonshot AI |             moonshot-v1-32k-vision-preview              |           5           |  20  |       通用大模型基座？       |
| Moonshot AI |             moonshot-v1-128k-vision-preview             |          10           |  30  |       通用大模型基座？       |
| SiliconFlow |                moonshotai/Kimi-K2.7-Code                |       1.3\|6.5        |  27  | 看前缀可知和moonshot官方售价相同 |
| SiliconFlow |                Pro/moonshotai/Kimi-K2.6                 |       1.1\|6.5        |  27  |    和moonshot官方售价相    |
|             |                                                         |                       |      |                      |
|             |                                                         |                       |      |                      |
|  DeepSeek   |                    deepseek-v4-flash                    |        0.02\|1        |  2   |       梁圣的恩情还不完       |
|  DeepSeek   |                     deepseek-v4-pro                     |       0.025\|3        |  6   |       梁圣的恩情还不完       |
| SiliconFlow |               deepseek-ai/DeepSeek-V4-Pro               |       0.025\|3        |  6   | 看前缀可知DeepSeek官方售价相同  |
| SiliconFlow |              deepseek-ai/DeepSeek-V4-Flash              |        0.02\|1        |  2   | 看前缀可知DeepSeek官方售价相同  |
| SiliconFlow | deepseek-ai/DeepSeek-V3.2,Pro/deepseek-ai/DeepSeek-V3.2 |        0.2\|2         |  3   |         不如V4         |
|   Minimax   |                MiniMax-M3(上下文 512K ~ 1M)                |       0.84\|4.2       | 16.8 |      💩中💩，营销之王      |
| SiliconFlow |                     zai-org/GLM-5.2                     |         2\|8          |  28  |       能力国产Top        |
| SiliconFlow |                  tencent/Hunyuan-MT-7B                  |         限时免费          | 限时免费 |     用于翻译，感觉中规中矩      |
| SiliconFlow |                stepfun-ai/Step-3.5-Flash                |          0.7          | 2.1  |       阶跃星辰，没用过       |
|             |                                                         |                       |      |                      |
除了较为激进地翻译（如翻译1600页的英文Orca手册）等高并发需求，正常使用或开发时尚未遇到限速问题
看起来SilionFlow很多定价都和原厂是一样的

>
>|             |                                 |                       |      |          |