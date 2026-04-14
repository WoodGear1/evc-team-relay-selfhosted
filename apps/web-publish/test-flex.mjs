import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.setContent(`
    <style>
      .pre-block {
        display: block;
      }
      .code-flex {
        display: flex;
        flex-direction: column;
      }
      .code-line {
        display: block;
        background: lightblue;
      }
    </style>
    <div id="test1">
      <pre class="pre-block"><code><span class="code-line">Line 1</span>\n<span class="code-line">Line 2</span></code></pre>
    </div>
    <div id="test2">
      <pre class="pre-block"><code class="code-flex"><span class="code-line">Line 1</span>\n<span class="code-line">Line 2</span></code></pre>
    </div>
  `);

  const height1 = await page.$eval('#test1 pre', el => el.clientHeight);
  const height2 = await page.$eval('#test2 pre', el => el.clientHeight);

  console.log('Height 1 (display: block code-line with newline):', height1);
  console.log('Height 2 (display: flex code):', height2);
  
  await browser.close();
})();