(() => {
  const normalize = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[:：*]+$/, "")
      .trim()
      .toLowerCase();
  const visible = (e) => e.getClientRects().length > 0;
  const labelOf = (el) =>
    (
      el.labels?.[0]?.innerText ||
      el.getAttribute("aria-label") ||
      el.getAttribute("placeholder") ||
      ""
    ).trim();
  const eligible = (el) =>
    visible(el) &&
    !el.disabled &&
    !["password", "hidden", "file", "submit", "button"].includes(el.type) &&
    !/password|token|secret|key|登录|密码/i.test(labelOf(el));
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.url !== chrome.runtime.getURL("assistant.html")
    )
      return;
    const controls = [
      ...document.querySelectorAll("input, textarea, select"),
    ].filter(eligible);
    if (message.action === "inspect") {
      const text = document.body.innerText;
      const command = text.match(
        /ascp[^\n]*subasp@upload\.ncbi\.nlm\.nih\.gov:uploads\/[A-Za-z0-9_@.-]+/,
      );
      reply({
        ok: true,
        data: {
          url: location.href,
          title: document.title,
          loggedIn: Boolean(
            document.querySelector('a[href*="/accounts/profile/"]'),
          ),
          command: command?.[0] || null,
          fields: controls.map((e) => ({
            label: labelOf(e),
            type: e.type,
            required: e.required,
            options:
              e.tagName === "SELECT"
                ? [...e.options].map((o) => o.text)
                : undefined,
          })),
          steps: [...document.querySelectorAll("h1,h2,h3")]
            .filter(visible)
            .map((e) => e.innerText)
            .slice(0, 20),
        },
      });
      return;
    }
    if (message.action === "fill") {
      const fields = message.fields;
      if (!fields || typeof fields !== "object" || Array.isArray(fields))
        return reply({ ok: false, error: "字段映射无效" });
      const plan = [],
        missing = [];
      for (const [label, value] of Object.entries(fields)) {
        if (typeof value !== "string" || value.length > 6000)
          return reply({ ok: false, error: "字段值无效" });
        const matched = controls.filter(
          (el) => normalize(labelOf(el)) === normalize(label),
        );
        if (
          matched.length !== 1 ||
          ["radio", "checkbox"].includes(matched[0].type)
        ) {
          missing.push(label);
          continue;
        }
        const el = matched[0];
        if (
          el.tagName === "SELECT" &&
          ![...el.options].some(
            (o) => o.value === value || normalize(o.text) === normalize(value),
          )
        ) {
          missing.push(label);
          continue;
        }
        plan.push({ el, value });
      }
      if (missing.length)
        return reply({
          ok: false,
          error: `页面字段发生变化或存在歧义，未代填：${missing.join("、")}`,
        });
      for (const { el, value } of plan) {
        if (el.tagName === "SELECT")
          el.value = [...el.options].find(
            (o) => o.value === value || normalize(o.text) === normalize(value),
          ).value;
        else
          Object.getOwnPropertyDescriptor(
            el.tagName === "TEXTAREA"
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype,
            "value",
          ).set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      reply({
        ok: true,
        data: {
          filled: plan.length,
          requiresReview: true,
          message: "当前步骤已代填，请在 NCBI 页面核对后保存/继续。",
        },
      });
    }
  });
})();
