# 同梱ライブラリ

オフライン（ホールなど電波の弱い場所）でも動くように、外部ライブラリをこのフォルダに同梱しています。
ファイルは cdnjs から取得したものを無改変で置いています。

| ファイル | ライブラリ | バージョン | ライセンス | 取得元 |
|---|---|---|---|---|
| `pdf.min.js` / `pdf.worker.min.js` | PDF.js（Mozilla） | 3.11.174 | Apache License 2.0 | https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/ |
| `three.min.js` | three.js | r128 | MIT License | https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/ |

- PDF.js: https://github.com/mozilla/pdf.js — ライセンス全文 https://www.apache.org/licenses/LICENSE-2.0
- three.js: https://github.com/mrdoob/three.js — ライセンス全文 https://github.com/mrdoob/three.js/blob/r128/LICENSE

更新するときは同じ場所から新しいバージョンを取得し、`js/io.js` と `js/view3d.js` の読み込み先、
`sw.js` のキャッシュ一覧とバージョン番号を合わせて更新してください。
