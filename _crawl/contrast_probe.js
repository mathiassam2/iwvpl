(() => {
  const toRGB = (c) => {
    if (typeof c !== 'string') return [255, 255, 255];
    if (c.startsWith('oklab') || c.startsWith('color(') || c.startsWith('lab')) {
      const m = c.match(/[0-9.]+/g) || [0, 0, 0];
      return [0, 1, 2].map((i) => {
        const v = +m[i] || 0;
        return Math.max(0, Math.min(255, v <= 1 ? v * 255 : v));
      });
    }
    const m = c.match(/[0-9.]+/g);
    return m ? [+m[0] || 0, +m[1] || 0, +m[2] || 0] : [255, 255, 255];
  };
  const alphaOf = (c) => {
    if (typeof c !== 'string' || !c.startsWith('rgb')) return 1;
    const m = c.match(/[0-9.]+/g);
    return m && m.length > 3 ? +m[3] : 1;
  };
  const over = (fg, bg) => {
    const f = toRGB(fg), a = alphaOf(fg);
    return [0, 1, 2].map((i) => f[i] * a + bg[i] * (1 - a));
  };
  const lumOf = (rgb) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const ratio = (a, b) => {
    const L1 = lumOf(a), L2 = lumOf(b);
    const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return +(((hi + 0.05) / (lo + 0.05)).toFixed(2));
  };
  const bgOf = (el) => {
    const stack = [];
    let n = el;
    while (n && n.nodeType === 1) {
      stack.push(getComputedStyle(n).backgroundColor);
      n = n.parentElement;
    }
    let acc = [255, 255, 255];
    for (let i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc);
    return acc;
  };

  const fails = [];
  let checked = 0;
  document.querySelectorAll('a,button,span,p,h1,h2,h3,h4,dt,dd,li,td,th,label,strong').forEach((el) => {
    if (el.children.length) return;
    const txt = (el.textContent || '').trim();
    if (!txt) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (parseFloat(cs.opacity) < 0.5) return;
    if (cs.color === 'rgba(0, 0, 0, 0)') return; // gradient-clipped text
    if (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const bg = bgOf(el);
    const fg = over(cs.color, bg);
    const size = parseFloat(cs.fontSize);
    const weight = +cs.fontWeight || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    checked++;
    if (ratio(fg, bg) < need) {
      fails.push({ t: txt.slice(0, 30), r: ratio(fg, bg), need, size, weight });
    }
  });

  return {
    theme: document.documentElement.className,
    route: location.pathname,
    checked,
    failCount: fails.length,
    fails: fails.slice(0, 8),
  };
})()