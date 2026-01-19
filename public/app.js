const form = document.querySelector("#item-form");
const resetButton = document.querySelector("#reset-form");
const list = document.querySelector("#inventory-list");
const searchInput = document.querySelector("#search");
const filterLocation = document.querySelector("#filter-location");
const filterStatus = document.querySelector("#filter-status");
const statTotal = document.querySelector("#stat-total");
const statExpiring = document.querySelector("#stat-expiring");
const statLow = document.querySelector("#stat-low");
const barcodeInput = document.querySelector("#item-barcode");
const scanToggle = document.querySelector("#scan-toggle");
const scanStatus = document.querySelector("#scan-status");
const scannerPreview = document.querySelector("#scanner-preview");
const openModalButton = document.querySelector("#open-modal");
const closeModalButton = document.querySelector("#close-modal");
const formModal = document.querySelector("#form-modal");

const state = {
  items: [],
};

const scanState = {
  active: false,
  detector: null,
  stream: null,
  zxingReader: null,
  usingZXing: false,
};

const padNumber = (value) => (Number.isFinite(value) ? value : 0);

const daysBetween = (date) => {
  if (!date) return null;
  const now = new Date();
  const target = new Date(date + "T00:00:00");
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
};

const isExpiringSoon = (item) => {
  const diff = daysBetween(item.expiration);
  return diff !== null && diff <= 7;
};

const isLowStock = (item) => padNumber(item.quantity) <= padNumber(item.minimum);

const apiRequest = async (url, options = {}) => {
  const config = {
    headers: { "Content-Type": "application/json" },
    ...options,
  };
  const response = await fetch(url, config);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
};

const lookupBarcode = async (barcode) => {
  if (!barcode) return;
  try {
    scanStatus.textContent = "Looking up barcode...";
    const data = await apiRequest(`/api/barcode/${encodeURIComponent(barcode)}`);
    if (!form.name.value.trim() && data.name) {
      form.name.value = data.name;
    }
    if (!form.category.value.trim() && data.category) {
      form.category.value = data.category;
    }
    if (!form.notes.value.trim() && data.brand) {
      form.notes.value = `Brand: ${data.brand}`;
    }
    scanStatus.textContent = data.name ? `Found ${data.name}` : "Barcode found.";
  } catch (error) {
    scanStatus.textContent = "No product found for that barcode.";
  }
};

const getFilters = () => ({
  search: searchInput.value.trim().toLowerCase(),
  location: filterLocation.value,
  status: filterStatus.value,
});

const formatQuantity = (item) => {
  const unit = item.unit ? ` ${item.unit}` : "";
  return `${padNumber(item.quantity)}${unit}`;
};

const renderStats = () => {
  if (!statTotal || !statExpiring || !statLow) return;
  statTotal.textContent = state.items.length;
  statExpiring.textContent = state.items.filter(isExpiringSoon).length;
  statLow.textContent = state.items.filter(isLowStock).length;
};

const buildBadges = (item) => {
  const badges = [];
  if (isLowStock(item)) {
    badges.push('<span class="badge low">Low stock</span>');
  }
  if (isExpiringSoon(item)) {
    badges.push('<span class="badge expiring">Expiring soon</span>');
  }
  return badges.join("");
};

const renderList = () => {
  const { search, location, status } = getFilters();
  list.innerHTML = "";

  const filtered = state.items.filter((item) => {
    const haystack = `${item.name} ${item.category} ${item.barcode}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    const matchesLocation = location === "all" || item.location === location;
    const matchesStatus =
      status === "all" ||
      (status === "expiring" && isExpiringSoon(item)) ||
      (status === "low" && isLowStock(item));
    return matchesSearch && matchesLocation && matchesStatus;
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="card">No items match the current filters.</div>';
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card";

    const expirationDiff = daysBetween(item.expiration);
    const expirationLabel =
      expirationDiff === null
        ? "No expiry"
        : expirationDiff < 0
          ? `${Math.abs(expirationDiff)} days past`
          : `${expirationDiff} days left`;

    card.innerHTML = `
      <div class="card-header">
        <div>
          <strong>${item.name}</strong>
          <div class="muted">${item.category || "Uncategorized"}</div>
        </div>
        <span class="tag">${item.location}</span>
      </div>
      <div class="card-grid">
        <div>
          <div class="muted">Quantity</div>
          <div>${formatQuantity(item)}</div>
        </div>
        <div>
          <div class="muted">Expires</div>
          <div>${expirationLabel}</div>
        </div>
        <div>
          <div class="muted">Minimum</div>
          <div>${padNumber(item.minimum)}</div>
        </div>
        <div>
          <div class="muted">Barcode</div>
          <div>${item.barcode || "-"}</div>
        </div>
      </div>
      <div class="muted">${item.notes || "No notes yet"}</div>
      <div>${buildBadges(item)}</div>
      <div class="card-actions">
        <button data-action="decrease" data-id="${item._id}">-</button>
        <button data-action="increase" data-id="${item._id}">+</button>
        <button data-action="edit" data-id="${item._id}" class="ghost">Edit</button>
        <button data-action="delete" data-id="${item._id}" class="ghost">Remove</button>
      </div>
    `;

    list.appendChild(card);
  });
};

const resetForm = () => {
  form.reset();
  document.querySelector("#item-qty").value = 1;
  document.querySelector("#item-min").value = 1;
  const hiddenId = form.querySelector("input[name='id']");
  if (hiddenId) {
    hiddenId.remove();
  }
};

const openModal = () => {
  if (!formModal) return;
  formModal.classList.add("open");
  formModal.setAttribute("aria-hidden", "false");
};

const closeModal = () => {
  if (!formModal) return;
  formModal.classList.remove("open");
  formModal.setAttribute("aria-hidden", "true");
};

const upsertItem = (item) => {
  const existingIndex = state.items.findIndex((entry) => entry._id === item._id);
  if (existingIndex >= 0) {
    state.items[existingIndex] = item;
  } else {
    state.items.unshift(item);
  }
};

const handleSubmit = async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const payload = {
    name: data.get("name").trim(),
    quantity: Number(data.get("quantity")),
    unit: data.get("unit").trim(),
    location: data.get("location"),
    category: data.get("category").trim(),
    expiration: data.get("expiration"),
    minimum: Number(data.get("minimum")),
    notes: data.get("notes").trim(),
    barcode: data.get("barcode").trim(),
  };

  try {
    const id = data.get("id");
    let item;
    if (id) {
      item = await apiRequest(`/api/items/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      item = await apiRequest("/api/items", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    upsertItem(item);
    renderStats();
    renderList();
    resetForm();
    closeModal();
  } catch (error) {
    console.error(error);
  }
};

const handleCardAction = async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  const item = state.items.find((entry) => entry._id === id);
  if (!item) return;

  try {
    if (action === "increase") {
      const updated = await apiRequest(`/api/items/${id}/adjust`, {
        method: "PATCH",
        body: JSON.stringify({ delta: 1 }),
      });
      upsertItem(updated);
    }
    if (action === "decrease") {
      const updated = await apiRequest(`/api/items/${id}/adjust`, {
        method: "PATCH",
        body: JSON.stringify({ delta: -1 }),
      });
      upsertItem(updated);
    }
    if (action === "delete") {
      await apiRequest(`/api/items/${id}`, { method: "DELETE" });
      state.items = state.items.filter((entry) => entry._id !== id);
    }
    if (action === "edit") {
      form.name.value = item.name;
      form.quantity.value = item.quantity;
      form.unit.value = item.unit;
      form.location.value = item.location;
      form.category.value = item.category;
      form.expiration.value = item.expiration;
      form.minimum.value = item.minimum;
      form.notes.value = item.notes;
      form.barcode.value = item.barcode || "";

      let hiddenId = form.querySelector("input[name='id']");
      if (!hiddenId) {
        hiddenId = document.createElement("input");
        hiddenId.type = "hidden";
        hiddenId.name = "id";
        form.appendChild(hiddenId);
      }
      hiddenId.value = item._id;
      form.scrollIntoView({ behavior: "smooth" });
      return;
    }

    renderStats();
    renderList();
  } catch (error) {
    console.error(error);
  }
};

const loadItems = async () => {
  try {
    const items = await apiRequest("/api/items");
    state.items = items;
    renderStats();
    renderList();
  } catch (error) {
    console.error(error);
  }
};

const stopScan = () => {
  scanState.active = false;
  scanToggle.textContent = "Start scan";
  scanState.usingZXing = false;
  if (scanState.zxingReader) {
    scanState.zxingReader.reset();
  }
  if (scanState.stream) {
    scanState.stream.getTracks().forEach((track) => track.stop());
    scanState.stream = null;
  }
  scannerPreview.srcObject = null;
};

const scanLoop = async () => {
  if (!scanState.active || !scanState.detector) return;
  try {
    const barcodes = await scanState.detector.detect(scannerPreview);
    if (barcodes.length) {
      barcodeInput.value = barcodes[0].rawValue;
      scanStatus.textContent = `Captured ${barcodes[0].rawValue}`;
      stopScan();
      lookupBarcode(barcodes[0].rawValue);
      return;
    }
  } catch (error) {
    scanStatus.textContent = "Unable to read barcode. Try a brighter spot.";
  }
  requestAnimationFrame(scanLoop);
};

const startScan = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    scanStatus.textContent = "Camera access is not available in this browser.";
    return;
  }
  try {
    if (scanState.usingZXing && scanState.zxingReader) {
      scanToggle.textContent = "Stop scan";
      scanStatus.textContent = "Scanning... hold the barcode steady.";
      scanState.active = true;
      scanState.zxingReader.decodeFromVideoDevice(
        null,
        scannerPreview,
        (result, error) => {
          if (result) {
            const value = result.getText();
            barcodeInput.value = value;
            scanStatus.textContent = `Captured ${value}`;
            stopScan();
            lookupBarcode(value);
          }
        }
      );
      return;
    }
    scanState.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    scannerPreview.srcObject = scanState.stream;
    await scannerPreview.play();
    scanState.active = true;
    scanToggle.textContent = "Stop scan";
    scanStatus.textContent = "Scanning... hold the barcode steady.";
    requestAnimationFrame(scanLoop);
  } catch (error) {
    scanStatus.textContent = "Camera access was blocked. Check permissions.";
  }
};

const setupBarcodeScanner = () => {
  if (!("BarcodeDetector" in window)) {
    if (window.ZXing?.BrowserMultiFormatReader) {
      scanState.zxingReader = new window.ZXing.BrowserMultiFormatReader();
      scanState.usingZXing = true;
      scanStatus.textContent = "Fallback scanner ready. Tap Start scan.";
    } else {
      scanStatus.textContent = "Barcode scanning is not supported in this browser.";
      scanToggle.disabled = true;
    }
    return;
  }
  scanState.detector = new BarcodeDetector({
    formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
  });
};

list.addEventListener("click", handleCardAction);
form.addEventListener("submit", handleSubmit);
resetButton.addEventListener("click", resetForm);
if (openModalButton && formModal) {
  openModalButton.addEventListener("click", openModal);
  closeModalButton.addEventListener("click", closeModal);
  formModal.addEventListener("click", (event) => {
    if (event.target === formModal) {
      closeModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}
barcodeInput.addEventListener("change", () => lookupBarcode(barcodeInput.value.trim()));
scanToggle.addEventListener("click", () => {
  if (scanState.active) {
    stopScan();
  } else {
    startScan();
  }
});
[searchInput, filterLocation, filterStatus].forEach((input) => {
  input.addEventListener("input", renderList);
});

setupBarcodeScanner();
loadItems();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  });
}
