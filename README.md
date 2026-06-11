# 时光隧道 · TimeChannel

以「时光隧道」的方式浏览相册：照片环绕成一条无限延伸的 3D 隧道，
你可以在回忆中前进、后退、漫游。WebGL（Three.js）实现，电脑与手机浏览器均可使用。

![preview](https://img.shields.io/badge/Three.js-r160-blueviolet)

## 演示

<p align="center">
  <img src="docs/media/timechannel-demo.gif" alt="TimeChannel demo" width="860">
</p>

[观看完整演示视频](docs/media/timechannel-demo.mp4)：展示照片隧道穿行、自动漫游、星空背景与照片聚焦效果。

## 运行

```bash
cd TimeChannel
npm install        # 首次
npm run dev        # 开发：http://localhost:5173
npm run build      # 产出 dist/（纯静态文件，任意静态服务器可部署）
```

首次打开会加载演示照片（picsum.photos）；离线时自动退化为本地渐变占位图。
不要直接双击 `index.html` 打开；模块、worker 与纹理加载需要通过 HTTP 服务运行。

## 玩法

| 操作 | 效果 |
|---|---|
| 滚轮 / 上下拖拽 / 触摸滑动 | 在隧道中前进、后退（带惯性） |
| `W` `S` / `↑` `↓` | 键盘穿行 |
| `A` `D` | 视角缩放（拉近 / 拉远） |
| 空格 或 「✦ 自动漫游」 | 自动缓缓前行 |
| 移动鼠标 | 视差环视 |
| 点击照片 | 灯箱放大查看，点击任意处 / `Esc` 返回 |
| 「⊕ My Photos」或直接拖入 | 导入照片：单张/批量，JPG/PNG/WebP/GIF + Apple HEIC/HEIF（Safari 原生解码，其他浏览器自动转码）；读取 EXIF 拍摄时间排序，多次导入自动累积 |
| 拖入文件夹或 Mac 照片图库（.photoslibrary） | 递归扫描，自动只取 originals/Masters 原图、跳过缩略图；导入阶段只持久化元数据与微缩图 |
| 点开照片 → 右侧 STORY 面板 | 为照片写下当时的故事；同一张照片的多条文字按时间线排列（时间轴在文字左侧），存在本地、跨会话保留 |
| 「◐ Sky」 | 星空配色：薰衣紫 / 玫瑰 / 海洋 / 极光 / 余烬 / 彩虹流转，选择会记住 |

## 时间轴

- 照片按时间排序：入口是现在，越深处越久远（演示照片用合成日期，导入照片优先读 EXIF 拍摄时间，退回文件修改时间）
- 跨年处有发光的年份路标悬在隧道下缘，飞行时迎面淡入淡出，不遮挡视线
- 右下角 HUD 以时间为刻度显示深度（如 `1,604 days ago · 2022`），按前后照片环的日期插值
- 点击照片放大后显示拍摄日期（如 `May 12, 2023`）
- 界面文字全英文

## 视觉

- UnrealBloom 辉光相框 + 暖色暗角 + 胶片颗粒
- 整条隧道悬在宇宙中：星空贯穿内外，流星不时划过——有的从照片缝隙间瞥见，有的在隧道尽头的黑洞星空里缓缓滑行
- 每张照片贴墙细微浮动（径向呼吸 ±0.12、前后 ±0.22、微摆），有生命感但不破坏隧道整体
- 隧道带弧度：沿多重正弦曲线蜿蜒，相机入弯轻微侧倾，穿行更有穿梭感
- 隧道外层是流动的星云 shader（fbm 噪声双层流动，流体感），配色可选，含彩虹模式
- 漂浮光尘、隧道尽头的光
- 速度越快 FOV 越大，有冲刺感；环会缓缓旋转

## 技术与架构

Vite + 原生 ES 模块（无前端框架），Three.js r160 + EffectComposer
（RenderPass → UnrealBloomPass → 自定义暗角/颗粒 ShaderPass → OutputPass）。

```
src/
├── main.js        # 装配 + 主循环（按序调用各模块 update）
├── config.js      # 配置、弯道函数、日期格式（纯函数）
├── events.js      # 极简事件总线
├── core/          # stage（渲染舞台/后期）、assets（纹理工具）
├── world/         # tunnel（照片环/回收/路标）、sky（星云/配色）、particles、meteors
├── album/         # album（照片数据唯一真源）、importer、texture-pool、store（IndexedDB）
├── interact/      # controls（输入/行进/相机）、focus（取出照片）、hover（悬停）
└── ui/            # timeline（滑条+HUD）、story（故事面板）、panels、toast、hint
```

数据流单向：`album` 是照片唯一真源，变更经 `album:changed` 事件广播，
隧道重铺、时间轴重建、聚焦收起由 main.js 按序编排；
照片以「环」为单位组织，相机穿过后环被回收到前方并换上下一批照片，实现无限隧道。
移动端自动降低环数、粒子数与辉光强度。

导入管线使用 worker 解析 EXIF 并生成 96px 微缩图；IndexedDB 持久化相册元数据、
微缩图和故事。隧道纹理由 `texture-pool` 按可见窗口懒解码为 512px，并用 LRU
控制 GPU 常驻数量，图库大小与显存占用解耦。
