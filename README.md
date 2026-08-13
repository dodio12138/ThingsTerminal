# Things Terminal

Things Terminal 是一个可本机自托管的个人设备资产台账，提供 Windows 98 风格的展示、搜索、录入、统计、详情和管理界面。数据保存在 SQLite，图片保存在本地目录，不依赖云账户。

## 功能

- 设备 CRUD、分类与品牌管理
- 使用中/已失去状态、购入和售出信息
- 稳定的父设备关系、标签、规格与保修截止日期
- 名称、分类、品牌、年份和状态筛选
- 可保存的首页排序和筛选偏好
- 基准币种与手工汇率设置，统计页显示来源和更新时间
- JSON v2 与 CSV 导出，JSON 追加/覆盖导入
- 图片真实类型验证、WebP 压缩、缩略图和孤立文件清理
- 管理密码保护、请求限速、安全响应头和结构化日志
- 数据库版本化迁移、备份、恢复和健康检查

## 快速开始

要求 Node.js 20 或更高版本。

```bash
npm ci
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。首次启动会把只读种子快照 `data/devices.sqlite` 复制到 `data/runtime/devices.sqlite`，再对运行时副本执行迁移。普通启动不会修改被 Git 跟踪的种子数据库。

生产启动必须设置长度至少为 12 的管理密码：

```bash
ADMIN_PASSWORD='replace-with-a-long-random-password' NODE_ENV=production npm start
```

不要把真实密码写入仓库或 `.env.example`。

## 数据目录

| 路径 | 用途 | Git 状态 |
| --- | --- | --- |
| `data/devices.sqlite` | 首次启动种子快照 | 跟踪，只读使用 |
| `data/runtime/devices.sqlite` | 当前运行数据 | 忽略并持久化 |
| `data/backups/` | `npm run backup` 生成的备份 | 忽略 |
| `public/uploads/` | WebP 原图和缩略图 | 忽略并持久化 |

旧数据中的文本父级会在迁移时转换为稳定的 `parentId`。如果旧父级只是一个集合名称，迁移会创建对应的集合节点，避免关系丢失。

## 环境变量

复制 `.env.example` 作为部署参考；应用本身不会自动读取 `.env`，应由 shell、容器或进程管理器注入。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | HTTP 端口 |
| `ADMIN_PASSWORD` | 空 | 开发时可为空；生产必须至少 12 字符 |
| `DATA_DIR` | `./data/runtime` | 运行时数据目录 |
| `DB_PATH` | `./data/runtime/devices.sqlite` | SQLite 文件 |
| `SEED_DB_PATH` | `./data/devices.sqlite` | 只读种子快照 |
| `UPLOAD_DIR` | `./public/uploads` | 图片目录 |
| `TRUST_PROXY` | `0` | 位于可信反向代理后时设为 `1` |
| `LOG_LEVEL` | `info` | `debug`、`info`、`warn` 或 `error` |

## 常用命令

```bash
npm run dev           # 热重载开发服务器
npm start             # 普通服务器
npm run check         # 全部 JS/MJS 语法检查
npm test              # 单元与 API 集成测试
npm run test:browser  # 六页面真实浏览器测试
npm run db:migrate    # 执行迁移并显示版本
npm run backup        # 创建并校验 SQLite 备份
npm run restore -- /absolute/path/to/backup.sqlite
```

恢复前必须停止应用。恢复脚本会先为当前数据库创建 `.before-restore-*` 安全副本，再校验来源、替换数据库并执行缺失迁移。

## 导入与导出

JSON v2 导出格式：

```json
{
  "schemaVersion": 2,
  "exportedAt": "2026-08-10T00:00:00.000Z",
  "items": []
}
```

导入兼容上述对象和旧版顶层数组。覆盖导入、追加导入和批量操作都运行在数据库事务中；任何一条校验失败会完整回滚。

CSV 导出带 UTF-8 BOM 和 `schemaVersion` 列，适合电子表格查看。API 可使用 `category`、`brand`、`status` 查询参数导出筛选结果，例如：

```text
GET /api/export?format=csv&status=active&category=Camera
```

## 货币统计口径

每台设备保存原始金额和币种。统计页按管理后台设置的汇率换算到基准币种，并明确显示：

- 汇率来源
- 汇率更新时间
- 每种货币相对 CNY 的换算值
- 无法转换的设备数量

内置值只是离线估算，不是实时汇率。需要实时口径时应手工更新并填写来源；离线状态会继续使用最后一次保存的有效值，不会声称数据是实时的。

每日成本使用买入金额除以持有天数。完整日期按实际日期计算；只有年月时按当月第一天计算；已失去设备以失去日期为终点，仍持有设备以当前日期为终点。缺少买入金额或入手时间时不显示每日成本。

## 安全模型

本项目定位是单用户、本机或私有网络工具，不是公网多用户系统。

- 公开接口只允许读取设备、分类、设置和健康状态。
- 写入、删除、导入、导出和上传要求 `x-admin-password`。
- 管理密码只保存在当前浏览器标签会话的 `sessionStorage`，关闭会话后清除。
- 服务端使用定时安全哈希比较、统一输入校验、1 MB JSON 限制和 API 限速。
- 用户文本在进入 HTML 模板时转义，图片路径经过安全检查。
- 上传文件会由 Sharp 解码验证；客户端 MIME 或扩展名不作为真实类型依据。
- 服务只暴露白名单前端资源，不会公开数据库、服务端源码或环境文件。

序列号属于敏感标识，目前有意不存储。若以后加入序列号、账户或公网访问，必须先设计登录会话、字段级权限、加密和隐私导出/删除流程，不能继续扩展共享密码模型。

## Docker

生产容器：

```bash
export ADMIN_PASSWORD='replace-with-a-long-random-password'
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:3000/health
```

容器以非 root `node` 用户运行，使用锁文件安装生产依赖，并为数据库和上传目录声明持久化挂载。开发容器：

```bash
docker compose -f docker-compose.dev.yml up --build
```

### 反向代理

只在可信代理实际覆盖应用时设置 `TRUST_PROXY=1`。代理应：

- 终止 HTTPS；
- 保留 `Host`、`X-Forwarded-For` 和 `X-Forwarded-Proto`；
- 把请求体限制在合理范围；
- 不记录 `x-admin-password`；
- 仅向受信网络开放管理页面和写接口。

## 升级与回滚

1. 停止写入并执行 `npm run backup`。
2. 记录当前 Git 提交与镜像标签。
3. 拉取新版本，运行 `npm ci` 和 `npm test`。
4. 执行 `npm run db:migrate`。
5. 启动应用并检查 `/health`、首页、管理页和导出。
6. 若失败，停止应用，切回旧提交/镜像，并使用 `npm run restore -- <backup>`。

结构化日志只记录时间、级别、请求 ID、方法、路径、状态码和耗时，不记录请求体、密码或设备备注。

## API

公开读取：

- `GET /health`
- `GET /api/meta`
- `GET /api/settings`
- `GET /api/categories`
- `GET /api/devices`
- `GET /api/devices/:id`

需要管理密码：

- `PUT /api/settings`
- `POST /api/categories`
- `PUT /api/categories/:name`
- `DELETE /api/categories/:name`
- `POST /api/devices`
- `PUT /api/devices/:id`
- `DELETE /api/devices/:id`
- `POST /api/devices/bulk-update`
- `POST /api/devices/bulk-delete`
- `GET /api/export`
- `POST /api/import`
- `POST /api/uploads`
- `POST /api/uploads/cleanup`

错误响应使用统一结构：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "name is required"
  }
}
```

## 代码结构

```text
server.js                 进程启动与优雅关闭
server/app.js             Express 应用、路由和中间件
server/database.js        数据库、迁移、查询与事务
server/validation.js      服务端输入规范
server/uploads.js         图片处理与清理
shared/                   前后端共享常量和财务规则
modules/                  页面 API、状态、渲染与后台逻辑
tests/                    单元、API 和浏览器测试
scripts/                  检查、迁移、备份与恢复
```

前端保持原生多页 ES Modules，不引入框架。`98.css` 作为锁定的 npm 依赖从本机提供，因此核心页面不依赖第三方 CDN。
