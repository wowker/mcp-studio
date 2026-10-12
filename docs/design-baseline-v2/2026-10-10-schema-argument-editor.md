# 参数输入区：布局与跳过语义

状态：可交互设计预览。此次仅调整 `docs/redesign/`；正式客户端继续使用既有参数编辑器。

## 对现有实现的引用

行为依据 `src/client/features/tabs/ParameterEditor.tsx`、`parameter-editor-model.ts` 与 `ParameterControls.tsx`：字段由 Schema 定义，而不是由当前 arguments 的键生成；可选字段缺失时展示为跳过；切换跳过使用删除键和按字段类型初始化的语义。生产回归依据包括 `DebugWorkspace.test.tsx` 中的可选空值、禁用控件、移除参数、Form / Raw 同步用例。

原型通过 `build-preview-schema.mjs` 将 `src/shared/json-schema.ts` 与方言解析依赖打包为本地浏览器资源，不另写一套 JSON Schema 校验规则。更新共享校验器后需重新执行此构建命令。工具 Schema 为演示数据，正式版本直接使用所连接 MCP 返回的 inputSchema；不通过示例参数推断必填项。`list_categories.parent_id` 的可选约束仅用于演示跳过与空字符串区别。

## 尺寸和层级

- 保留工具目录、工具 Tab、上方参数 / 下方结果布局。初始请求区比例从 44% 调整为 52%，重置和 Home 使用同一默认值；扩大编辑区仍为 65%。两部分独立滚动。
- 普通字段两列；数组和对象占整行；窄屏使用一列。字段名、必填标识 / 跳过、描述和类型约束、输入控件、就近错误顺序固定。
- 文本控件高 36px，宽度受所在列和 640px 上限约束。数值宽度上限 180px，枚举 280px。复杂 JSON 默认高 132px、最小 120px，可拖动至 320px；使用等宽字体。
- 字段说明与类型约束并排，必要时自然换行；字段组使用细分隔线。顶部汇总必填完成数、错误数与跳过数。错误使用边框、文字、aria-invalid 和 aria-describedby 共同表达。
- 可选布尔使用开关，但 false 仍会发送。两种主题、中文 / 英文与键盘聚焦使用同一组 tokens 和翻译资源。

## 数据语义

2026-10-12 设计约定：新建草稿的所有可选字段默认跳过，即使 Schema 声明 default；取消跳过才初始化默认值。仅点击、聚焦、离开字段或取消跳过而未编辑，不显示校验错误。真实编辑后显示对应错误，执行前做完整校验。恢复历史、载入已保存及复制 Tab 则保留显式参数，不再次应用默认跳过。

| 状态 | 控件 | arguments / 校验 |
| --- | --- | --- |
| 必填且未填写 | 不提供跳过；必填占位提示 | 缺失键按 required 校验；空字符串是否有效由 minLength 等约束决定 |
| 可选且跳过 | 保留字段，禁用输入 | 删除键，不发送，不触发此字段的值校验 |
| 取消跳过 | 恢复可编辑 | 优先 Schema default；否则 string `""`、boolean `false`、array `[]`、object `{}`、数字 `null`；不恢复被删除的旧值 |
| 已包含的空字符串 | 可编辑 | 保留 `""`；按 Schema 校验，不能静默省略 |
| 空数字输入 | 可编辑、显示错误（不允许 null 时） | 表示 `null`，不自动变成 0 |
| `0` / `false` | 正常输入 | 有值；仅按 Schema 范围 / 类型校验 |
| 空数组 / 对象 | JSON 编辑器 | 保留 `[]` / `{}`；按 minItems / required 等规则校验 |
| JSON 语法错误 | 保留原文并显示错误 | 保持上一份可解析值；阻止执行、保存此未解析草稿和切换到 Raw 模式 |
| 可解析但不符合 Schema | 显示对应字段错误 | 可在 Form / Raw 间切换；执行受阻，仍可保存待完善的请求草稿 |

Form、Raw、保存请求、执行快照与调用历史使用同一 canonical arguments。Raw 中省略可选字段后，返回 Form 仍显示该字段及已勾选的跳过控件。必填字段不允许通过 Skip 绕过校验；执行时聚焦第一个错误字段。

输入错误按编辑 / 执行状态就近展示；切换语言重新生成 Schema 错误文字，不改变原始参数。Tab 和项目切换、复制 Tab、主题切换保留草稿和跳过状态。无输入字段的工具显示空态，并禁用 Raw 编辑入口。

## 组件边界和验证

`workbench-parameters.js` 提供 `schemaFor / initialValue / create`；实例负责渲染、字段输入适配、错误展示与汇总，不保存跨 Tab 状态。Tab 持有 arguments、raw、数组原文草稿、解析错误、已编辑字段与执行校验状态。样式独立位于 `workbench-parameters.css`。正式 React 组件沿用项目 Schema 编辑器、控件和共享类型，字符串模板不作为正式组件实现。

```sh
node docs/redesign/build-preview-schema.mjs
node docs/redesign/verify-workbench-parameters.mjs
```

专项检查包括缺失 / 空值 / null / 0 / false / 空集合区别、默认值、所有可选类型的省略和恢复、两列尺寸、必填保护、Form / Raw 往返、数值 / 枚举 / 数组约束、保存及历史 payload、Tab / 项目隔离、主题语言切换、桌面和窄屏滚动边界。完整原型与仓库验证结果见 README 和 `preview-assets/` 报告。
