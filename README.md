# 帐篷分享社群管理系统 (zfl-3)

露营装备共享社群管理系统，基于 Nuxt 3 + Vue 3 构建。支持装备管理、借用申请、押金管理、出行盘点、费用结算、候补预约等功能。

## 功能模块

- **装备库**：装备档案、分类管理、健康状态追踪
- **借用管理**：申请审批、交接记录、押金管理
- **出行管理**：出行计划、装备清单、成员管理
- **盘点管理**：出行前后盘点、异常处理、押金扣除
- **费用结算**：押金结算、公共费用分摊、多成员结算
- **候补预约**：智能排队、优先级计算、自动转正
- **数据管理**：导入导出、空间模板、数据迁移

## 技术栈

- **框架**：Nuxt 3 + Vue 3 (Composition API)
- **测试**：Vitest + @vue/test-utils + happy-dom
- **存储**：LocalStorage (本地持久化)

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:5173` 查看应用。

### 构建生产版本

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## 质量门禁

### 一条命令完成所有检查

```bash
npm run quality
```

该命令会依次执行：
1. **单元测试** - 运行所有测试用例
2. **覆盖率检查** - 生成覆盖率报告并验证阈值
3. **构建检查** - 验证项目可正常构建

失败时会输出具体失败的模块和用例，便于定位问题。

### CI 环境命令

```bash
npm run quality:ci
```

CI 模式下输出 JUnit 格式的测试报告，便于集成到 CI/CD 流水线。

## 测试体系

### 测试分层

| 层级 | 目录 | 说明 | 运行命令 |
|------|------|------|----------|
| 工具函数测试 | `tests/utils/` | 纯函数单元测试，覆盖核心业务逻辑 | `npm run test:utils` |
| 组合式函数测试 | `tests/composables/` | Vue composable 集成测试 | `npm run test:composables` |
| 集成测试 | `tests/integration/` | 跨模块链路测试 | `npm run test:integration` |
| 冒烟测试 | `tests/smoke/` | 核心链路快速验证 + 组件渲染 | `npm run test:smoke` |

### 重点测试链路

#### 1. 候补预约链路

- 候补创建与优先级计算
- 日期冲突检测
- 自动转正与批量审核
- 健康分影响优先级

测试文件：
- [tests/composables/useReservation.test.js](tests/composables/useReservation.test.js)
- [tests/utils/reservationTransform.test.js](tests/utils/reservationTransform.test.js)

#### 2. 数据导入归一化

- 多实体数据归一化（成员、装备、申请、出行、押金、盘点、结算、候补）
- 格式兼容（旧版格式、模板格式）
- 异常数据容错
- 合并分析与执行

测试文件：
- [tests/utils/dataTransform.test.js](tests/utils/dataTransform.test.js)
- [tests/smoke/crossModule.smoke.test.js](tests/smoke/crossModule.smoke.test.js)

#### 3. 盘点异常扣押金

- 异常标记自动计算
- 异常操作 CRUD
- 待处理扣款查询
- 押金扣除应用

测试文件：
- [tests/composables/useInventory.test.js](tests/composables/useInventory.test.js)
- [tests/utils/inventoryTransform.test.js](tests/utils/inventoryTransform.test.js)

#### 4. 结算刷新链路

- 结算单创建（出行关联/手工）
- 押金关联与自动计算
- 盘点扣款联动
- 成员支付管理
- 结算完结验证

测试文件：
- [tests/composables/useSettlement.test.js](tests/composables/useSettlement.test.js)
- [tests/utils/settlementTransform.test.js](tests/utils/settlementTransform.test.js)

#### 5. 跨模块完整链路

候补预约 → 转正 → 借出 → 盘点异常 → 扣押金 → 结算刷新 → 结算完成

测试文件：
- [tests/integration/crossModule.test.js](tests/integration/crossModule.test.js)
- [tests/smoke/crossModule.smoke.test.js](tests/smoke/crossModule.smoke.test.js)

### 测试命令速查

```bash
# 运行所有测试
npm test
npm run test:unit

# 监听模式
npm run test:watch

# 可视化界面
npm run test:ui

# 覆盖率报告
npm run test:coverage

# 仅运行工具函数测试
npm run test:utils

# 仅运行组合式函数测试
npm run test:composables

# 仅运行集成测试
npm run test:integration

# 仅运行冒烟测试
npm run test:smoke

# 数据导入导出回归测试
npm run test:import-export
```

### 覆盖率阈值

| 指标 | 阈值 |
|------|------|
| 语句覆盖率 | 40% |
| 分支覆盖率 | 30% |
| 函数覆盖率 | 40% |
| 行覆盖率 | 40% |

> 核心工具函数覆盖率约 73%，核心 composable 覆盖率约 72%。整体覆盖率较低主要由于部分非核心模块（设备健康、事件日志、出行向导等）暂未覆盖测试。

覆盖率报告生成在 `coverage/` 目录下，包含：
- 文本摘要（控制台输出）
- HTML 报告（`coverage/html/`）
- LCOV 报告（`coverage/lcov.info`）

## 项目结构

```
zfl-3/
├── components/          # Vue 组件
│   ├── InventoryPanel.vue       # 盘点面板
│   ├── ReservationPanel.vue     # 候补预约面板
│   ├── SettlementPanel.vue      # 结算面板
│   ├── DataImportExport.vue     # 数据导入导出
│   └── ...
├── composables/         # 组合式函数
│   ├── useInventory.js         # 盘点业务逻辑
│   ├── useReservation.js       # 候补预约逻辑
│   ├── useSettlement.js        # 结算逻辑
│   └── ...
├── utils/               # 工具函数（纯函数，易于测试）
│   ├── inventoryTransform.js    # 盘点数据转换
│   ├── reservationTransform.js  # 候补数据转换
│   ├── settlementTransform.js   # 结算数据转换
│   └── dataTransform.js         # 数据导入导出归一化
├── tests/               # 测试文件
│   ├── setup.js               # 测试全局 setup
│   ├── testData.js            # 测试数据构造器
│   ├── utils/                 # 工具函数测试
│   ├── composables/           # 组合式函数测试
│   ├── integration/           # 集成测试
│   └── smoke/                 # 冒烟测试
├── app.vue              # 根组件
├── nuxt.config.ts       # Nuxt 配置
├── vitest.config.js     # Vitest 配置
└── package.json         # 项目配置
```

## 开发规范

### 测试原则

1. **工具函数优先测试**：纯函数逻辑优先用单元测试覆盖
2. **组合式函数集成测试**：业务逻辑通过 composable 测试验证
3. **关键链路必测**：候补转正、盘点扣押金、结算刷新等跨模块链路必须有集成测试
4. **冒烟测试快速验证**：核心功能有冒烟测试，确保基本可用

### 新增测试

1. 工具函数测试放在 `tests/utils/` 目录
2. Composable 测试放在 `tests/composables/` 目录
3. 跨模块集成测试放在 `tests/integration/` 目录
4. 冒烟测试放在 `tests/smoke/` 目录

测试文件命名：`*.test.js`

## 浏览器冒烟验证

如需进行真实浏览器冒烟验证：

1. 启动开发服务器：`npm run dev`
2. 访问 `http://localhost:5173`
3. 检查页面是否正常加载、各面板是否可切换
4. 验证核心功能：创建装备、提交申请、创建盘点、生成结算单

## License

Private
