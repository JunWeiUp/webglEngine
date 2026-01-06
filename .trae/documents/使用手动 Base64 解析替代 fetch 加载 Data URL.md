# 优化 Data URL 加载策略

用户提出当 URL 是 `data:` 开头（如 Base64 图片）时，不需要进行网络请求。虽然 `fetch` 可以处理 Data URI，但直接解析可能更高效，且能避免某些网络栈的开销或兼容性问题。

## 方案
修改 `loadTextureBitmap` 方法，当检测到 `url` 以 `data:` 开头时，直接使用 `Image` 对象加载（或者直接通过 `fetch` 获取 blob 但不走网络栈？其实 `fetch` 处理 data url 本质上就是解析，不走网络）。

但既然用户明确提出“不需要请求网络”，我们可以优化为：
如果 URL 是 Data URI，我们直接用 `createImageBitmap` 加载 Blob（如果是 fetch）或者 Image。

实际上，`fetch('data:...')` 是符合标准的，且现代浏览器优化得很好。
但如果用户坚持，我们可以手动将 Data URL 转换为 Blob，然后调用 `createImageBitmap`。或者，更简单的，直接使用 `Image` 对象加载 Data URL，因为这不需要异步 `fetch`。

不过，`loadTextureBitmap` 的目的是利用 `createImageBitmap` 的多线程解码能力。
我们可以手动解析 Base64 为 Blob，然后传给 `createImageBitmap`。

**手动解析 Data URL 为 Blob 的步骤：**
1. 分割 Header 和 Body。
2. 解码 Base64。
3. 创建 Uint8Array。
4. 创建 Blob。

这比 `fetch(dataUrl).blob()` 快吗？不一定，因为 `fetch` 是原生实现的。
但如果 `fetch` 在某些环境下报错（如前面遇到的 ERR_ABORTED），手动解析是更稳妥的 fallback。

**替代方案：**
直接使用 `fetch` 是最标准的方法。用户可能误以为 `fetch` 一定走网络。
但如果用户希望显式避免 `fetch`，我们可以这样做：

```typescript
if (url.startsWith('data:')) {
    // 方法 1: 使用 Image 加载 (回退到主线程解码，但兼容性好)
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
             // createTexture...
             resolve(texture);
        };
        img.src = url;
    });
}
```

考虑到 `TextureManager` 中已经有 `loadTexture` 的 fallback 逻辑（使用 `new Image()`），我们可以在 `loadTexture` 入口处判断：
如果 `url.startsWith('data:')`，直接走 `new Image()` 路径，而不调用 `loadTextureBitmap`（后者使用 `fetch`）。

或者，保留 `loadTextureBitmap`，但在其中对 Data URL 做特殊处理：
```typescript
if (url.startsWith('data:')) {
    const res = await fetch(url); // 这里的 fetch 纯内存操作
    const blob = await res.blob();
    // ...
}
```

既然用户抱怨 `net::ERR_ABORTED`，可能是因为 `fetch` 对 Data URL 的处理在某些浏览器插件或配置下被拦截了。

**最终计划：**
在 `loadTexture` 的入口处，如果检测到 Data URL，**强制使用 `Image` 对象加载**，绕过 `fetch` 和 `createImageBitmap`（或者在 Image 加载后用 createImageBitmap？不，Image 加载完已经是解码后的了）。
虽然 `Image` 是主线程解码，但对于 Data URL（通常是小图标或生成的纹理），这通常是可以接受的，且能避免 `fetch` 的潜在问题。

**修改 `TextureManager.ts`**:
1. 在 `loadTexture` 方法开头，检查 `url.startsWith('data:')`。
2. 如果是，跳过 `createImageBitmap` 分支，直接进入 `new Image()` 的 Promise 逻辑。

或者，修改 `loadTextureBitmap`，如果是 Data URL，使用 `fetch` 获取 Blob（这通常没问题，只要没 CORS）。既然我们已经去掉了 CORS，如果还报错，那就彻底不用 fetch。

让我们采用**混合策略**：
在 `loadTexture` 中，如果 `url.startsWith('data:')`，直接跳过 `loadTextureBitmap` 调用，走下方的 `new Image()` 逻辑。这最简单且稳健。

**Wait**，`loadTextureBitmap` 使用 `createImageBitmap` 是为了性能（后台解码）。如果 Data URL 图片很大（如 Base64 编码的大图），主线程解码会卡顿。
更好的方式是：使用 `fetch` 获取 Blob（不走网络），然后 `createImageBitmap`。
既然前面已经修复了 CORS 问题，如果用户只是想确认“不走网络”，我们可以解释 `fetch('data:...')` 不走网络。
但如果用户仍然遇到错误或坚持，我们可以实现一个 `dataURItoBlob` 函数来替代 `fetch`。

**Code Change**:
为了响应用户的 "如何是url是data:image/png开头不需要请求网络" (How to avoid network request if url starts with data:image/png)，我将实现一个 `base64ToBlob` 的辅助方法，在 `loadTextureBitmap` 中替代 `fetch`。

```typescript
    private static base64ToBlob(dataURI: string): Blob {
        const splitDataURI = dataURI.split(',');
        const byteString = atob(splitDataURI[1]);
        const mimeString = splitDataURI[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mimeString });
    }
```

然后在 `loadTextureBitmap` 中：
```typescript
let blob: Blob;
if (url.startsWith('data:')) {
    blob = this.base64ToBlob(url);
} else {
    const response = await fetch(url, fetchOptions);
    blob = await response.blob();
}
```
这样就完全避开了 `fetch`，确实“没有网络请求”。
