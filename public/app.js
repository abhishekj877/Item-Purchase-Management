"use strict";

(() => {
  const content = document.getElementById("page-content");
  const modal = document.getElementById("modal");
  const toast = document.getElementById("toast");
  const state = { page: "overview", items: [], types: [], purchases: [], search: "", filter: "all" };
  let toastTimer;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const dateToday = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const dateText = value => {
    if (!value) return "—";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, {
      month: "short", day: "numeric", year: "numeric"
    }).format(date);
  };
  const stockStatus = item => Number(item.stock_available) === 0 ? "out"
    : Number(item.stock_available) <= 5 ? "low" : "good";
  const stockLabel = status => ({ good: "In stock", low: "Low stock", out: "Out of stock" })[status];
  const badge = (text, className = text.toLowerCase()) => `<span class="badge ${escapeHtml(className)}">${escapeHtml(text)}</span>`;
  const itemCell = (item, index = 0) => {
    const initials = item.name.trim().slice(0, 1).toUpperCase();
    const colors = ["", "orange", "green", "blue"];
    return `<span class="item-cell"><span class="item-avatar ${colors[index % colors.length]}">${escapeHtml(initials)}</span><span>${escapeHtml(item.name)}<span class="secondary">#${item.id}</span></span></span>`;
  };
  const empty = (title, text, action = "") => `<div class="empty"><strong>${title}</strong>${text}${action}</div>`;
  const table = (headers, rows, emptyMarkup, count) => rows.length
    ? `<div class="table-wrap"><table><thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div><div class="table-footer"><span>Showing ${count} ${count === 1 ? "record" : "records"}</span><span>Stockroom inventory</span></div>`
    : emptyMarkup;
  const addIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
    });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
  }

  async function refresh() {
    const [types, items, purchases] = await Promise.all([
      api("/api/item-types"),
      api("/api/items?includeInactive=true"),
      api("/api/purchases")
    ]);
    state.types = types;
    state.items = items;
    state.purchases = purchases;
    render();
  }

  function heading(title, subtitle, action = "") {
    return `<div class="page-heading"><div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${action}</div>`;
  }

  function render() {
    const names = { overview: "Overview", items: "Items", types: "Item types", purchases: "Purchases", stock: "Stock availability" };
    document.getElementById("breadcrumb-current").textContent = names[state.page];
    document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.page === state.page));
    const renderers = { overview: renderOverview, items: renderItems, types: renderTypes, purchases: renderPurchases, stock: renderStock };
    content.innerHTML = renderers[state.page]();
  }

  function renderOverview() {
    const activeItems = state.items.filter(item => Boolean(item.active));
    const totalUnits = activeItems.reduce((sum, item) => sum + Number(item.stock_available), 0);
    const attention = activeItems.filter(item => stockStatus(item) !== "good").length;
    const openOrders = state.purchases.length;
    const stats = [
      ["◈", "", "Active items", activeItems.length, `${state.items.length} total items`],
      ["▥", "green", "Units in stock", totalUnits.toLocaleString(), "Across active items"],
      ["⇄", "amber", "Purchase orders", openOrders, "Historical orders recorded"],
      ["!", attention ? "amber" : "green", "Need attention", attention, "Low or out of stock"]
    ];
    const recent = state.purchases.slice(0, 5);
    const rows = recent.map(purchase => `<tr><td>${escapeHtml(purchase.order_id)}</td><td>${purchase.items.length} item${purchase.items.length === 1 ? "" : "s"}</td><td>${dateText(purchase.purchase_date)}</td><td>${badge("Recorded", "received")}</td><td><button class="button small" data-view-purchase="${purchase.id}">View details</button></td></tr>`);
    return `${heading("Inventory overview", "Your items, availability, and purchase history at a glance.", `<button class="button primary" data-action="new-item">${addIcon}Add item</button>`)}
      <section class="stats">${stats.map(([icon, color, label, value, note]) => `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon ${color}">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`).join("")}</section>
      <section class="panel"><div class="toolbar"><div class="toolbar-title"><h2>Recent purchases</h2><span class="count">(${recent.length})</span></div><button class="button" data-page="purchases">View purchase history →</button></div>
      ${table(["Order ID", "Items", "Purchase date", "History", "Details"], rows, empty("No purchases yet", "New purchases will be listed here.", `<div class="empty-action"><button class="button primary" data-action="new-purchase">Create purchase</button></div>`), rows.length)}</section>`;
  }

  function filteredItems() {
    const query = state.search.toLowerCase();
    return state.items.filter(item => {
      const matchesText = !query || `${item.name} ${item.type_name} ${item.id}`.toLowerCase().includes(query);
      const matchesFilter = state.filter === "all" ||
        (state.filter === "active" && Boolean(item.active)) ||
        (state.filter === "inactive" && !Boolean(item.active)) ||
        (state.filter === "low" && Boolean(item.active) && stockStatus(item) === "low") ||
        (state.filter === "out" && Boolean(item.active) && stockStatus(item) === "out");
      return matchesText && matchesFilter;
    });
  }

  function itemRows(items, stockPage = false) {
    return items.map((item, index) => {
      const status = stockStatus(item);
      const lastCell = stockPage
        ? `<td>${status === "out" ? "Restock needed" : status === "low" ? "Low stock · reorder soon" : "Stock available"}</td>`
        : `<td><div class="row-actions"><button class="icon-button" data-view-item="${item.id}" aria-label="View ${escapeHtml(item.name)}">View</button><button class="icon-button" data-edit-item="${item.id}" aria-label="Edit ${escapeHtml(item.name)}">Edit</button><button class="icon-button" data-toggle-item="${item.id}" aria-label="${item.active ? "Deactivate" : "Activate"} ${escapeHtml(item.name)}">${item.active ? "Off" : "On"}</button><button class="icon-button delete" data-delete-item="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">Delete</button></div></td>`;
      return `<tr><td>${itemCell(item, index)}</td><td>${escapeHtml(item.type_name)}</td><td>${dateText(item.purchase_date)}</td><td>${Number(item.stock_available).toLocaleString()}</td><td>${badge(stockLabel(status), status)}</td><td>${badge(Boolean(item.active) ? "Active" : "Inactive", Boolean(item.active) ? "active" : "inactive")}</td>${lastCell}</tr>`;
    });
  }

  function renderItems() {
    const items = filteredItems();
    const rows = itemRows(items);
    return `${heading("Items", "Create and maintain your item master and stock quantities.", `<button class="button primary" data-action="new-item">${addIcon}Add item</button>`)}
      <section class="panel"><div class="toolbar"><div class="toolbar-title"><h2>All items</h2><span class="count">(${items.length})</span></div><div class="toolbar-actions">
      <label class="search"><span class="search-icon">⌕</span><input id="item-search" type="search" value="${escapeHtml(state.search)}" placeholder="Search items..." aria-label="Search items"></label>
      <select class="control" id="item-filter" aria-label="Filter items"><option value="all" ${state.filter === "all" ? "selected" : ""}>All items</option><option value="active" ${state.filter === "active" ? "selected" : ""}>Active</option><option value="inactive" ${state.filter === "inactive" ? "selected" : ""}>Inactive</option><option value="low" ${state.filter === "low" ? "selected" : ""}>Low stock</option><option value="out" ${state.filter === "out" ? "selected" : ""}>Out of stock</option></select>
      </div></div>${table(["Item", "Type", "Purchase date", "Stock", "Availability", "Status", "Actions"], rows, empty("No items found", state.items.length ? "Try another search or filter." : "Create an item to start managing your inventory.", `<div class="empty-action"><button class="button primary" data-action="new-item">Add item</button></div>`), items.length)}</section>`;
  }

  function renderStock() {
    const items = filteredItems().filter(item => Boolean(item.active));
    const rows = itemRows(items, true);
    return `${heading("Stock availability", "Review active item quantities and spot products that need replenishment.", `<button class="button" data-page="items">Manage items →</button>`)}
      <section class="panel"><div class="toolbar"><div class="toolbar-title"><h2>Current availability</h2><span class="count">(${items.length})</span></div><div class="toolbar-actions">
      <label class="search"><span class="search-icon">⌕</span><input id="item-search" type="search" value="${escapeHtml(state.search)}" placeholder="Search items..." aria-label="Search items"></label>
      <select class="control" id="item-filter" aria-label="Filter stock"><option value="all" ${state.filter === "all" ? "selected" : ""}>All stock</option><option value="low" ${state.filter === "low" ? "selected" : ""}>Low stock</option><option value="out" ${state.filter === "out" ? "selected" : ""}>Out of stock</option></select>
      </div></div>${table(["Item", "Type", "Purchase date", "Current stock", "Availability", "Status", "Stock note"], rows, empty("No matching stock", "Adjust your search or item status to see stock."), items.length)}</section>`;
  }

  function renderTypes() {
    const rows = state.types.map(type => {
      const count = state.items.filter(item => Number(item.item_type_id) === Number(type.id)).length;
      return `<tr><td>${escapeHtml(type.type_name)}</td><td>${count} item${count === 1 ? "" : "s"}</td><td><div class="row-actions"><button class="icon-button" data-edit-type="${type.id}">Edit</button><button class="icon-button delete" data-delete-type="${type.id}">Delete</button></div></td></tr>`;
    });
    return `${heading("Item types", "Organize inventory with reusable item categories.", `<button class="button primary" data-action="new-type">${addIcon}Add item type</button>`)}
      <section class="panel"><div class="toolbar"><div class="toolbar-title"><h2>All item types</h2><span class="count">(${state.types.length})</span></div></div>
      ${table(["Type name", "Items using type", "Actions"], rows, empty("No item types", "Add a type before creating an item.", `<div class="empty-action"><button class="button primary" data-action="new-type">Add item type</button></div>`), rows.length)}</section>`;
  }

  function renderPurchases() {
    const query = state.search.toLowerCase();
    const purchases = state.purchases.filter(purchase => !query ||
      `${purchase.order_id} ${purchase.items.map(item => item.item_name).join(" ")}`.toLowerCase().includes(query));
    const rows = purchases.map(purchase => {
      const itemSummary = purchase.items.map(item => `${escapeHtml(item.item_name)} × ${item.quantity}`).join(", ");
      return `<tr><td>${escapeHtml(purchase.order_id)}</td><td>${purchase.items.length} item${purchase.items.length === 1 ? "" : "s"}<span class="secondary">${itemSummary}</span></td><td>${dateText(purchase.purchase_date)}</td><td>${badge("Recorded", "received")}</td><td><div class="row-actions"><button class="icon-button" data-view-purchase="${purchase.id}">Details</button><button class="icon-button" data-edit-purchase="${purchase.id}">Edit</button></div></td></tr>`;
    });
    return `${heading("Purchases", "Create multi-item orders and keep a permanent purchase history.", `<button class="button primary" data-action="new-purchase">${addIcon}New purchase</button>`)}
      <div class="notice">Purchases are retained for audit history and cannot be deleted. Updating a purchase adjusts stock by the quantity difference.</div>
      <section class="panel"><div class="toolbar"><div class="toolbar-title"><h2>Purchase history</h2><span class="count">(${purchases.length})</span></div>
      <label class="search"><span class="search-icon">⌕</span><input id="purchase-search" type="search" value="${escapeHtml(state.search)}" placeholder="Search orders or items..." aria-label="Search purchases"></label></div>
      ${table(["Order ID", "Items", "Purchase date", "History", "Actions"], rows, empty("No purchases found", state.purchases.length ? "Try another search." : "Create a purchase to start your history.", `<div class="empty-action"><button class="button primary" data-action="new-purchase">Create purchase</button></div>`), purchases.length)}</section>`;
  }

  function openModal(title, subtitle, body) {
    modal.innerHTML = `<div class="modal-head"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="icon-button" data-modal-close aria-label="Close">✕</button></div>${body}`;
    modal.showModal();
  }

  function closeModal() {
    if (modal.open) modal.close();
  }

  function itemForm(item) {
    const typeOptions = state.types.map(type => `<option value="${type.id}" ${item && Number(item.item_type_id) === Number(type.id) ? "selected" : ""}>${escapeHtml(type.type_name)}</option>`).join("");
    openModal(item ? "Update item" : "Add item", "Enter item information and its current stock.", `
      <form class="modal-body" id="item-form"><div class="form-grid">
        <div class="field full"><label for="field-name">Item name *</label><input id="field-name" name="name" required maxlength="120" value="${escapeHtml(item?.name || "")}" placeholder="e.g. Wireless Mouse"></div>
        <div class="field"><label for="field-type">Item type *</label><select id="field-type" name="item_type_id" required><option value="">Select type</option>${typeOptions}</select></div>
        <div class="field"><label for="field-date">Purchase date *</label><input id="field-date" name="purchase_date" type="date" required value="${escapeHtml(item?.purchase_date || dateToday())}"></div>
        <div class="field"><label for="field-stock">Stock available *</label><input id="field-stock" name="stock_available" type="number" min="0" step="1" required value="${escapeHtml(item?.stock_available ?? 0)}"></div>
        <div class="field"><label for="field-active">Status *</label><select id="field-active" name="active" required><option value="1" ${!item || item.active ? "selected" : ""}>Active</option><option value="0" ${item && !item.active ? "selected" : ""}>Inactive</option></select></div>
      </div><div class="modal-actions"><button type="button" class="button" data-modal-close>Cancel</button><button class="button primary" type="submit">${item ? "Save changes" : "Create item"}</button></div></form>`);
    document.getElementById("item-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const payload = {
        name: data.get("name"),
        item_type_id: Number(data.get("item_type_id")),
        purchase_date: data.get("purchase_date"),
        stock_available: Number(data.get("stock_available")),
        active: data.get("active") === "1"
      };
      try {
        await api(item ? `/api/items/${item.id}` : "/api/items", {
          method: item ? "PUT" : "POST", body: JSON.stringify(payload)
        });
        closeModal(); await refresh(); showToast(item ? "Item updated." : "Item created.");
      } catch (error) { showFormError(form, error.message); }
    });
  }

  function typeForm(type) {
    openModal(type ? "Update item type" : "Add item type", "Item types help keep your inventory organized.", `
      <form class="modal-body" id="type-form"><div class="field"><label for="field-type-name">Type name *</label><input id="field-type-name" name="type_name" required maxlength="80" value="${escapeHtml(type?.type_name || "")}" placeholder="e.g. Electronics"></div>
      <div class="modal-actions"><button type="button" class="button" data-modal-close>Cancel</button><button class="button primary" type="submit">${type ? "Save changes" : "Create type"}</button></div></form>`);
    document.getElementById("type-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api(type ? `/api/item-types/${type.id}` : "/api/item-types", {
          method: type ? "PUT" : "POST",
          body: JSON.stringify({ type_name: new FormData(form).get("type_name") })
        });
        closeModal(); await refresh(); showToast(type ? "Item type updated." : "Item type created.");
      } catch (error) { showFormError(form, error.message); }
    });
  }

  function showFormError(form, message) {
    let notice = form.querySelector(".notice.error");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "notice error";
      notice.setAttribute("role", "alert");
      form.prepend(notice);
    }
    notice.textContent = message;
  }

  function purchaseForm(purchase) {
    const preservedInactiveIds = new Set((purchase?.items || [])
      .filter(line => !line.item_active)
      .map(line => Number(line.item_id)));
    const availableItems = state.items.filter(item => Boolean(item.active) || preservedInactiveIds.has(Number(item.id)));
    if (!availableItems.length) {
      showToast("Create an active item with stock before creating a purchase.");
      navigate("items");
      return;
    }
    const existing = purchase ? purchase.items.map(line => ({ item_id: Number(line.item_id), quantity: Number(line.quantity) })) : [];
    const initialLines = existing.length ? existing : [{ item_id: Number(availableItems[0].id), quantity: 1 }];
    openModal(purchase ? `Update ${escapeHtml(purchase.order_id)}` : "New purchase", "Add one or more active items to this order.", `
      <form class="modal-body" id="purchase-form">
        <div class="form-grid">
          <div class="field"><label for="field-order-id">Order ID</label><input id="field-order-id" value="${escapeHtml(purchase?.order_id || "Generated on save")}" disabled></div>
          <div class="field"><label for="field-purchase-date">Purchase date *</label><input id="field-purchase-date" name="purchase_date" type="date" required value="${escapeHtml(purchase?.purchase_date || dateToday())}"></div>
        </div>
        <div class="line-heading"><strong>Items in this order</strong><button type="button" class="button small" id="add-line">+ Add item</button></div>
        <div class="line-items" id="line-items"></div>
        <div class="line-summary" id="line-summary"></div>
        <div class="modal-actions"><button type="button" class="button" data-modal-close>Cancel</button><button class="button primary" type="submit">${purchase ? "Save purchase" : "Create purchase"}</button></div>
      </form>`);

    const lineContainer = document.getElementById("line-items");
    const options = availableItems.map(item => `<option value="${item.id}">${escapeHtml(item.name)} · ${Number(item.stock_available)} in stock${item.active ? "" : " · inactive (existing order)"}</option>`).join("");
    const drawLines = () => {
      const lines = [...lineContainer.querySelectorAll(".line-row")];
      const unique = new Set(lines.map(line => line.querySelector("[name='item_id']").value));
      document.getElementById("line-summary").textContent = `${lines.length} item${lines.length === 1 ? "" : "s"} · ${unique.size === lines.length ? "No duplicate items" : "Choose a different item on each line"}`;
      document.querySelectorAll(".line-remove").forEach(button => { button.disabled = lines.length === 1; });
    };
    const addLine = line => {
      const row = document.createElement("div");
      row.className = "line-row";
      row.innerHTML = `<div class="field"><label>Item *</label><select name="item_id" required>${options}</select></div><div class="field"><label>Quantity *</label><input name="quantity" type="number" min="1" step="1" required value="${escapeHtml(line?.quantity ?? 1)}"></div><button class="line-remove" type="button" aria-label="Remove item">×</button>`;
      row.querySelector("[name='item_id']").value = String(line?.item_id ?? availableItems[0].id);
      row.querySelector(".line-remove").addEventListener("click", () => { row.remove(); drawLines(); });
      row.querySelectorAll("select, input").forEach(input => input.addEventListener("input", drawLines));
      lineContainer.append(row); drawLines();
    };
    initialLines.forEach(addLine);
    document.getElementById("add-line").addEventListener("click", () => {
      const selected = new Set([...lineContainer.querySelectorAll("[name='item_id']")].map(select => select.value));
      const next = state.items.find(item => Boolean(item.active) && !selected.has(String(item.id)));
      if (!next) { showToast("No other active item is available to add."); return; }
      addLine({ item_id: next.id, quantity: 1 });
    });
    document.getElementById("purchase-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const lines = [...lineContainer.querySelectorAll(".line-row")].map(row => ({
        item_id: Number(row.querySelector("[name='item_id']").value),
        quantity: Number(row.querySelector("[name='quantity']").value)
      }));
      const uniqueIds = new Set(lines.map(line => line.item_id));
      if (uniqueIds.size !== lines.length) { showFormError(form, "An item may only appear once in a purchase."); return; }
      try {
        await api(purchase ? `/api/purchases/${purchase.id}` : "/api/purchases", {
          method: purchase ? "PUT" : "POST",
          body: JSON.stringify({ purchase_date: document.getElementById("field-purchase-date").value, items: lines })
        });
        closeModal(); await refresh(); showToast(purchase ? "Purchase updated and stock adjusted." : "Purchase created and stock updated.");
      } catch (error) { showFormError(form, error.message); }
    });
  }

  async function itemDetails(id) {
    try {
      const item = await api(`/api/items/${id}`);
      const history = state.purchases.flatMap(purchase => purchase.items
        .filter(line => Number(line.item_id) === Number(item.id))
        .map(line => `<tr><td>${escapeHtml(purchase.order_id)}</td><td>${dateText(purchase.purchase_date)}</td><td>${line.quantity}</td></tr>`));
      openModal(escapeHtml(item.name), "Item details and linked purchase history.", `
        <div class="modal-body"><div class="detail-grid">
          <div class="detail-box"><span>Item type</span><strong>${escapeHtml(item.type_name)}</strong></div>
          <div class="detail-box"><span>Purchase date</span><strong>${dateText(item.purchase_date)}</strong></div>
          <div class="detail-box"><span>Current stock</span><strong>${Number(item.stock_available).toLocaleString()}</strong></div>
          <div class="detail-box"><span>Status / availability</span><strong>${item.active ? "Active" : "Inactive"} · ${stockLabel(stockStatus(item))}</strong></div>
        </div><section class="panel"><div class="toolbar"><h2>Purchase history</h2></div>
        ${table(["Order ID", "Purchase date", "Quantity"], history, empty("No purchase history", "This item has not been purchased yet."), history.length)}</section>
        <div class="modal-actions"><button class="button" data-modal-close>Close</button></div></div>`);
    } catch (error) { showToast(error.message); }
  }

  async function purchaseDetails(id) {
    try {
      const purchase = await api(`/api/purchases/${id}`);
      const rows = purchase.items.map(line => `<tr><td>${escapeHtml(line.item_name)}<span class="secondary">#${line.item_id}</span></td><td>${escapeHtml(line.type_name)}</td><td>${line.quantity}</td><td>${Number(line.stock_available).toLocaleString()}</td><td>${line.item_active ? "Active" : "Inactive"}</td></tr>`);
      openModal(escapeHtml(purchase.order_id), "Purchase details · historical transaction retained.", `
        <div class="modal-body"><div class="detail-grid"><div class="detail-box"><span>Order ID</span><strong>${escapeHtml(purchase.order_id)}</strong></div><div class="detail-box"><span>Purchase date</span><strong>${dateText(purchase.purchase_date)}</strong></div></div>
        <section class="panel">${table(["Item", "Item type", "Quantity", "Current stock", "Item status"], rows, empty("No purchase lines", "This purchase has no items."), rows.length)}</section>
        <div class="modal-actions"><button class="button" data-modal-close>Close</button><button class="button primary" data-modal-edit-purchase="${purchase.id}">Edit purchase</button></div></div>`);
    } catch (error) { showToast(error.message); }
  }

  async function editPurchase(id) {
    const purchase = state.purchases.find(entry => Number(entry.id) === Number(id));
    if (!purchase) { showToast("Purchase not found."); return; }
    closeModal();
    purchaseForm(purchase);
  }

  function navigate(page) {
    state.page = page;
    state.search = "";
    state.filter = "all";
    render();
  }

  document.addEventListener("click", async event => {
    const target = event.target.closest("[data-page], [data-action], [data-modal-close], [data-view-item], [data-edit-item], [data-toggle-item], [data-delete-item], [data-edit-type], [data-delete-type], [data-view-purchase], [data-edit-purchase], [data-modal-edit-purchase]");
    if (!target) return;
    if (target.dataset.page) { event.preventDefault(); navigate(target.dataset.page); return; }
    if (target.hasAttribute("data-modal-close")) { closeModal(); return; }
    if (target.dataset.action === "new-item") { itemForm(null); return; }
    if (target.dataset.action === "new-type") { typeForm(null); return; }
    if (target.dataset.action === "new-purchase") { purchaseForm(null); return; }
    if (target.dataset.viewItem) { await itemDetails(target.dataset.viewItem); return; }
    if (target.dataset.editItem) {
      const item = state.items.find(entry => Number(entry.id) === Number(target.dataset.editItem));
      if (item) itemForm(item);
      return;
    }
    if (target.dataset.toggleItem) {
      const item = state.items.find(entry => Number(entry.id) === Number(target.dataset.toggleItem));
      if (!item) return;
      const active = !Boolean(item.active);
      if (!confirm(`${active ? "Activate" : "Deactivate"} "${item.name}"?`)) return;
      try {
        await api(`/api/items/${item.id}/status`, { method: "PATCH", body: JSON.stringify({ active }) });
        await refresh(); showToast(`Item ${active ? "activated" : "deactivated"}.`);
      } catch (error) { showToast(error.message); }
      return;
    }
    if (target.dataset.deleteItem) {
      const item = state.items.find(entry => Number(entry.id) === Number(target.dataset.deleteItem));
      if (!item || !confirm(`Delete "${item.name}"? Items with purchase history must be deactivated instead.`)) return;
      try {
        await api(`/api/items/${item.id}`, { method: "DELETE" });
        await refresh(); showToast("Item deleted.");
      } catch (error) { showToast(error.message); }
      return;
    }
    if (target.dataset.editType) {
      const type = state.types.find(entry => Number(entry.id) === Number(target.dataset.editType));
      if (type) typeForm(type);
      return;
    }
    if (target.dataset.deleteType) {
      const type = state.types.find(entry => Number(entry.id) === Number(target.dataset.deleteType));
      if (!type || !confirm(`Delete item type "${type.type_name}"?`)) return;
      try {
        await api(`/api/item-types/${type.id}`, { method: "DELETE" });
        await refresh(); showToast("Item type deleted.");
      } catch (error) { showToast(error.message); }
      return;
    }
    if (target.dataset.viewPurchase) { await purchaseDetails(target.dataset.viewPurchase); return; }
    if (target.dataset.editPurchase || target.dataset.modalEditPurchase) {
      await editPurchase(target.dataset.editPurchase || target.dataset.modalEditPurchase);
    }
  });

  document.addEventListener("input", event => {
    if (event.target.id === "item-search" || event.target.id === "purchase-search") {
      state.search = event.target.value;
      const position = event.target.selectionStart;
      render();
      const replacement = document.getElementById(event.target.id);
      replacement?.focus();
      replacement?.setSelectionRange(position, position);
    }
  });

  document.addEventListener("change", event => {
    if (event.target.id === "item-filter") {
      state.filter = event.target.value;
      render();
      document.getElementById("item-filter").value = state.filter;
    }
  });
  modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });

  refresh().catch(error => {
    content.innerHTML = `<div class="notice error" role="alert"><strong>Could not load the application data.</strong><br>${escapeHtml(error.message)}<br>Check that the server is connected to MySQL and reload this page.</div>`;
  });
})();
