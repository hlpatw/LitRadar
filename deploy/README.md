# LitRadar 独立部署指南

## 准备工作

- 服务器已安装 **Docker** 和 **Docker Compose**
- 服务器已安装 **Node.js >= 22**

## 快速开始

```bash
cd deploy

# 1. 构建应用
./build.sh

# 2. 启动服务（PostgreSQL + App）
docker compose up -d

# 3. 访问应用
# 打开浏览器访问 http://<服务器IP>:3000
```

## 首次使用

1. 访问 `http://<服务器IP>:3000/register` 注册账号
2. 登录后即可使用文献雷达全部功能
3. 系统已预置 38 个核心心理语言学期刊和会议源

## 环境变量

复制 `.env.example` 为 `.env` 并按需修改：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://litradar:litradar_secret@db:5432/litradar` |
| `JWT_SECRET` | JWT 签名密钥 | 请务必修改为随机字符串 |
| `SERVER_PORT` | 应用端口 | `3000` |

## 目录结构

```
deploy/
├── build.sh              # 构建脚本
├── Dockerfile             # 应用镜像
├── docker-compose.yml     # 编排文件
├── .env.example           # 环境变量模板
├── migration.sql          # 数据库建表
├── seed.sql               # 预置期刊数据
├── overlay/               # 独立部署覆盖文件
└── build/                 # 构建产物（build.sh 生成）
```

## 升级更新

从妙搭导出新的源码包后，替换部署文件并重新构建：

```bash
cd deploy
./build.sh
docker compose down
docker compose up -d --build
```