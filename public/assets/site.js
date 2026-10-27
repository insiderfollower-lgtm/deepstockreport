// DeepStockReport — cart drawer, add-to-cart buttons, forms, small UI bits.
// The cart stores only what was chosen (catalog ids / custom requests);
// prices always come from the server via /api/quote.
(function () {
  "use strict";
  var KEY = "dsr_cart_v2";
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function save(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function money(c) { return "$" + (c / 100).toFixed(c % 100 === 0 ? 0 : 2); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { d._status = r.status; return d; }); });
  }

  var items = load();
  var lastQuote = null;

  function updateCount() {
    var el = $("#cartCount");
    if (!el) return;
    el.textContent = items.length;
    el.classList.toggle("show", items.length > 0);
  }

  function render() {
    updateCount();
    var list = $("#cartItems"), totals = $("#cartTotals"), form = $("#cartCheckout");
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<p class="cart-empty">Your cart is empty. <a href="/reports#catalog">Browse the catalog</a> or <a href="/reports#request">request a custom report</a>.</p>';
      totals.innerHTML = "";
      form.hidden = true;
      return;
    }
    form.hidden = false;
    list.innerHTML = '<p class="cart-empty">Updating prices…</p>';
    post("/api/quote", { items: items }).then(function (q) {
      lastQuote = q;
      // Drop anything the server no longer recognises (e.g. a retired report).
      if (q.problems && q.problems.length) {
        var bad = q.problems.map(function (p) { return p.key; });
        items = items.filter(function (i) { return bad.indexOf(i.key) < 0; });
        save(items); updateCount();
      }
      list.innerHTML = q.lines.map(function (l) {
        return '<div class="cart-item"><div class="ci-main"><p class="ci-label">' + esc(l.name) + '</p><p class="ci-detail">' +
          esc(l.detail) + (l.notes ? " — " + esc(l.notes) : "") + '</p></div><span class="ci-price">' + money(l.unit_cents) +
          '</span><button class="ci-remove" type="button" data-remove="' + esc(l.key) + '" aria-label="Remove ' + esc(l.name) + '">&times;</button></div>';
      }).join("") || '<p class="cart-empty">Your cart is empty.</p>';
      totals.innerHTML = q.lines.length ? (
        '<div class="row"><span>Subtotal</span><span>' + money(q.subtotal_cents) + "</span></div>" +
        (q.discount_cents ? '<div class="row discount"><span>Bundle discount (' + q.discount_percent + '%)</span><span>−' + money(q.discount_cents) + "</span></div>" : "") +
        '<div class="row total"><span>Total</span><span>' + money(q.total_cents) + "</span></div>") : "";
      if (!q.lines.length) form.hidden = true;
    }).catch(function () {
      list.innerHTML = '<p class="cart-empty">Couldn’t load prices — please check your connection and try again.</p>';
    });
  }

  function openCart() {
    $("#cartDrawer").classList.add("open");
    $("#cartDrawer").setAttribute("aria-hidden", "false");
    $("#cartOverlay").classList.add("open");
    render();
    setTimeout(function () { $("#cartCloseBtn").focus(); }, 50);
  }
  function closeCart() {
    $("#cartDrawer").classList.remove("open");
    $("#cartDrawer").setAttribute("aria-hidden", "true");
    $("#cartOverlay").classList.remove("open");
  }

  function add(item) {
    item.key = uid();
    if (item.type === "catalog" && items.some(function (i) { return i.type === "catalog" && i.id === item.id; })) {
      openCart(); return;
    }
    items.push(item);
    save(items);
    openCart();
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-add-catalog],[data-remove],[data-copy],#cartOpenBtn,#cartCloseBtn,#cartOverlay");
    if (!t) return;
    if (t.id === "cartOpenBtn") openCart();
    else if (t.id === "cartCloseBtn" || t.id === "cartOverlay") closeCart();
    else if (t.hasAttribute("data-add-catalog")) add({ type: "catalog", id: t.getAttribute("data-add-catalog") });
    else if (t.hasAttribute("data-remove")) {
      var k = t.getAttribute("data-remove");
      items = items.filter(function (i) { return i.key !== k; });
      save(items); render();
    } else if (t.hasAttribute("data-copy")) {
      var input = $(t.getAttribute("data-copy"));
      input.select();
      (navigator.clipboard ? navigator.clipboard.writeText(input.value) : Promise.reject()).catch(function () { document.execCommand("copy"); });
      t.textContent = "Copied";
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCart(); });

  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (f.id === "cartCheckout") {
      e.preventDefault();
      var msg = $("#cartMsg"), btn = $("#cartCheckoutBtn"), email = $("#cartEmail").value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "Please enter the email we should deliver to."; return; }
      btn.disabled = true; msg.textContent = "Opening secure checkout…";
      post("/api/checkout", { email: email, items: items }).then(function (d) {
        if (d.url) { window.location.href = d.url; return; }
        btn.disabled = false; msg.textContent = d.error || "Checkout failed — please try again."; render();
      }).catch(function () { btn.disabled = false; msg.textContent = "Network error — please try again."; });
    } else if (f.id === "customForm") {
      e.preventDefault();
      var ticker = f.ticker.value.trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9.\-:]{0,14}$/.test(ticker)) { $("#customMsg").textContent = "Please enter a valid ticker symbol."; f.ticker.focus(); return; }
      add({ type: "custom", ticker: ticker, language: f.language.value, level: f.level.value, notes: f.notes.value.trim() });
      f.reset(); f.level.value = "Medium"; $("#customMsg").textContent = ticker + " added to your cart.";
    } else if (f.hasAttribute("data-api")) {
      // Generic JSON form (watchlist, affiliate sign-up).
      e.preventDefault();
      var out = f.querySelector(".form-msg"), submit = f.querySelector("[type=submit]");
      var data = {};
      Array.prototype.forEach.call(f.elements, function (el) {
        if (!el.name) return;
        data[el.name] = el.type === "checkbox" ? el.checked : el.value;
      });
      submit.disabled = true; out.textContent = "Sending…";
      post(f.getAttribute("data-api"), data).then(function (d) {
        submit.disabled = false;
        if (d.error) { out.textContent = d.error; return; }
        if (d.dashboard) {
          f.outerHTML = '<div class="form-done"><h3>Welcome aboard!</h3><p>Your referral link:</p><p class="mono break">' + esc(d.link) +
            '</p><p>Your private dashboard (bookmark it — we emailed it too):</p><p><a class="btn small" href="' + esc(d.dashboard) + '">Open my dashboard</a></p></div>';
          return;
        }
        out.textContent = d.message || "Thanks!";
        f.reset();
      }).catch(function () { submit.disabled = false; out.textContent = "Network error — please try again."; });
    }
  });

  // Debate tabs on the How-it-works page.
  document.querySelectorAll(".debate-tabs").forEach(function (group) {
    var tabs = group.querySelectorAll('[role="tab"]');
    var root = group.parentNode;
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) { t.setAttribute("aria-selected", "false"); });
        tab.setAttribute("aria-selected", "true");
        root.querySelectorAll(".debate-panel").forEach(function (p) {
          p.classList.toggle("active", p.getAttribute("data-panel") === tab.getAttribute("data-tab"));
        });
      });
    });
  });

  // After a successful order, empty the cart.
  if ($("[data-clear-cart]")) { items = []; save(items); }
  if (/[?&]canceled=1/.test(location.search)) {
    var note = document.createElement("p");
    note.className = "toast";
    note.textContent = "Checkout canceled — your cart is still here.";
    document.body.appendChild(note);
    setTimeout(function () { note.remove(); }, 5000);
  }
  updateCount();
})();
