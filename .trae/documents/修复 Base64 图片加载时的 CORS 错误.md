# 修复 TextureManager 加载 Base64 图片的错误

用户报告了一个 `net::ERR_ABORTED` 错误，该错误发生在使用 `fetch` 加载 Base64 编码的图片（Data URL）时。

## 原因分析
在 `src/engine/utils/TextureManager.ts` 中，`loadTextureBitmap` 方法使用了 `fetch` 来加载图片资源：
```typescript
const response = await fetch(url, { signal, mode: 'cors' });
```
虽然现代浏览器通常支持 `fetch` 加载 Data URL，但在某些环境或配置下（特别是设置了 `mode: 'cors'` 时），尝试 fetch 一个 `data:` 协议的 URL 可能会失败或被视为跨域错误（即使 data 协议本质上是本地的）。

对于 Data URL，通常不需要网络请求，直接解析即可。使用 `fetch` 是一种通用的方法，但更稳健的方法是检测 Data URL 并直接用 `Image` 对象加载，或者确保 `fetch` 不带 `mode: 'cors'`（或者浏览器正确处理）。

不过，更简单的修复方法是：
如果 URL 是 Data URL (以 `data:` 开头)，我们应该回退到使用 `new Image()` 的方式加载，或者在使用 `fetch` 时不做 CORS 检查（因为 Data URL 不涉及跨域）。

实际上，`loadTexture` 方法中已经有一个基于 `new Image()` 的回退路径（在 `createImageBitmap` 不存在时）。但在这里 `createImageBitmap` 存在，所以走到了 `loadTextureBitmap`。

## 解决方案
修改 `loadTextureBitmap`，如果是 Data URL，则不设置 `mode: 'cors'`，或者直接让它回退到 `Image` 加载方式（因为 Data URL 通常较小，主线程解码影响不大，且 `fetch` Data URL 有时会有兼容性问题）。

最稳妥的方式：
在 `loadTexture` 中判断，如果 `url.startsWith('data:')`，直接使用 `Image` 方式加载，跳过 `fetch` + `createImageBitmap` 路径（除非我们确信 fetch data url 没问题）。或者在 `loadTextureBitmap` 中针对 Data URL 去掉 `mode: 'cors'`。

考虑到 Data URL 可能是 Base64 编码的 PNG，`fetch` 确实能工作，只要去掉 `mode: 'cors'`。

**计划：**
修改 `src/engine/utils/TextureManager.ts` 的 `loadTextureBitmap` 方法：
在调用 `fetch` 时，检查 `url` 是否以 `data:` 开头。如果是，则不传递 `mode: 'cors'`。

或者更简单：让 `fetch` 自动处理。Data URL 不需要 CORS。

```typescript
const fetchOptions: RequestInit = { signal };
if (!url.startsWith('data:')) {
    fetchOptions.mode = 'cors';
}
const response = await fetch(url, fetchOptions);
```

## 验证
加载 Base64 图片不再报错。
