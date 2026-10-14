import { describe, expect, it } from "vitest";
import { layout } from "./layout";

describe("HTMX history privacy boundary", () => {
  for (const opts of [{title:"Admin",active:"admin",admin:true},{title:"Kontribusi",active:"submit",user:"local@example.test"},{title:"Masuk",active:"login"}]) {
    it(`keeps ${opts.active} opt-out inside the history element's serialized contents`, () => {
      const html=layout(opts,"<p>Private</p>");
      expect(html).toMatch(/<main[^>]*\bhx-history="false"/);
      expect(html).not.toMatch(/<div id="page-shell"[^>]*\bhx-history="false"/);
    });
  }
  it("leaves unauthenticated public discovery cacheable",()=>{
    expect(layout({title:"Peta",active:"home"},"<p>Public</p>")).not.toContain('hx-history="false"');
  });
});
