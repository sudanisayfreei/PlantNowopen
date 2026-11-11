const DATA_URL = document.body.dataset.dataUrl || "/data/sudan/agriculture-snapshot.json";
const GEOCODER_URL = "https://nominatim.openstreetmap.org/reverse";
const NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point";
const MAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const REVERSE_GEOCODE_INTERVAL_MS = 1100;

const categoryLabels = {
  production: "الإنتاج",
  season: "الموسم الزراعي",
  climate: "المناخ والأمطار",
};

const categoryIcons = {
  production: "٪",
  season: "◷",
  climate: "☼",
};

const sourceDescriptions = {
  "fao-giews-sudan": "متابعة المواسم الزراعية وتقديرات الإنتاج والأمن الغذائي.",
  "fao-gaez-v4": "بيانات النطاقات الزراعية والملاءمة المحصولية المقدّرة.",
  "isric-soilgrids": "خرائط عالمية لخواص التربة مع دقتها المكانية وعدم اليقين.",
  "nasa-power": "بيانات مناخية مرتبطة بالموقع لدعم فهم الظروف المناخية.",
  "osm-nominatim": "تحويل إحداثيات موقعك إلى اسم منطقة قريب، اعتمادًا على بيانات OpenStreetMap.",
};

const sourceMarks = {
  "fao-giews-sudan": "FAO",
  "fao-gaez-v4": "FAO",
  "isric-soilgrids": "IS",
  "nasa-power": "NASA",
  "osm-nominatim": "OSM",
};

const factsGrid = document.querySelector("#facts-grid");
const sourcesGrid = document.querySelector("#sources-grid");
const loadError = document.querySelector("#load-error");
const snapshotDate = document.querySelector("#snapshot-date");
const locateButton = document.querySelector("#locate-button");
const locationName = document.querySelector("#location-name");
const locationStatus = document.querySelector("#location-status");
const locationCoordinates = document.querySelector("#location-coordinates");
let map;
let locationMarker;
let lastReverseGeocodeAt = 0;
let activeRecommendationCategory = "grains";

const cropCandidates = {
  grains: [
    {
      name: "الذرة الرفيعة",
      summary: "من أهم حبوب السودان. خيار يستحق الدراسة للموقع بعد التحقق من أمطار الموسم والتربة والصنف المحلي.",
      condition: "تحقق من ملاءمة المطر أو توفر الري",
      source: "https://www.fao.org/giews/countrybrief/country.jsp?code=SDN",
    },
    {
      name: "الدخن",
      summary: "من الحبوب المزروعة في السودان؛ قارن احتياج الصنف للرطوبة مع موسم الأمطار المحلي.",
      condition: "ملاءمة المطر والتربة تختلف محليًا",
      source: "https://www.fao.org/giews/countrybrief/country.jsp?code=SDN",
    },
    {
      name: "القمح",
      summary: "قد يكون خيارًا للموسم الشتوي حيث تتوفر مياه ري موثوقة ومناخ مناسب.",
      condition: "يحتاج ريًا منتظمًا وموسمًا مناسبًا",
      irrigatedOnly: true,
      source: "https://www.fao.org/giews/countrybrief/country.jsp?code=SDN",
    },
  ],
  seedlings: [
    {
      name: "شتول البامية",
      summary: "مرشح للموسم الدافئ؛ اختر موعد النقل بعد التأكد من الحرارة والرطوبة الملائمتين.",
      condition: "تحتاج ريًا وقت التأسيس",
      source: "https://gaez.fao.org/",
    },
    {
      name: "شتول الطماطم",
      summary: "يمكن دراسة زراعتها في فترة ألطف حرارة مع انتظام الري والصرف الجيد.",
      condition: "تحقق من حرارة الموسم والصرف",
      source: "https://gaez.fao.org/",
    },
    {
      name: "شتول البصل",
      summary: "خيار موسمي يحتاج توقيتًا مناسبًا وريًا مضبوطًا؛ لا تحدد بيانات الموقع وحدها موعد الزراعة.",
      condition: "تحقق من الموسم والصنف المحلي",
      source: "https://gaez.fao.org/",
    },
  ],
  fruit: [
    {
      name: "المانجو",
      summary: "شجرة محبة للدفء؛ يلزم التأكد من ملاءمة الصنف للموقع وتوفر الماء، خصوصًا خلال التأسيس.",
      condition: "تحتاج ماءً خلال التأسيس",
      source: "https://gaez.fao.org/",
    },
    {
      name: "الجوافة",
      summary: "خيار مثمر يمكن التحقق من ملاءمته للصنف والتربة والصرف في منطقتك.",
      condition: "تحقق من التربة والصرف والري",
      source: "https://gaez.fao.org/",
    },
    {
      name: "النخيل",
      summary: "يناسب بيئات حارة، لكن نجاحه وإنتاجه يعتمدان على الصنف والمياه وجودة التربة.",
      condition: "تحقق من ملوحة الماء والتربة",
      source: "https://gaez.fao.org/",
    },
  ],
};

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("ar", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function createFactCard(fact) {
  const card = document.createElement("article");
  card.className = "fact-card";

  const top = document.createElement("div");
  top.className = "fact-topline";

  const category = document.createElement("span");
  category.className = "fact-category";
  category.textContent = categoryLabels[fact.category] ?? "مؤشر زراعي";

  const icon = document.createElement("span");
  icon.className = "fact-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = categoryIcons[fact.category] ?? "•";
  top.append(category, icon);

  const title = document.createElement("h3");
  title.textContent = fact.category === "production"
    ? "إنتاج الحبوب"
    : fact.category === "season"
      ? "مواعيد الموسم"
      : "الأمطار الموسمية";

  const description = document.createElement("p");
  description.textContent = fact.textAr;

  const footer = document.createElement("div");
  footer.className = "fact-footer";

  const period = document.createElement("span");
  period.className = "fact-period";
  period.textContent = fact.referencePeriod;

  const source = document.createElement("a");
  source.className = "fact-source";
  source.href = fact.sourceUrl;
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.textContent = "مصدر المعلومة ↗";

  footer.append(period, source);
  card.append(top, title, description, footer);
  return card;
}

function createSourceCard(source) {
  const card = document.createElement("article");
  card.className = "source-card";

  const mark = document.createElement("span");
  mark.className = "source-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = sourceMarks[source.id] ?? "↗";

  const title = document.createElement("h3");
  title.textContent = source.name;

  const description = document.createElement("p");
  description.textContent = sourceDescriptions[source.id] ?? source.use ?? "";

  const link = document.createElement("a");
  link.className = "source-link";
  link.href = source.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "زيارة المصدر ↗";

  card.append(mark, title, description, link);
  return card;
}

function getLocationLabel(address = {}) {
  const areaNames = [
    address.neighbourhood,
    address.suburb,
    address.quarter,
    address.city_district,
    address.village,
    address.town,
    address.city,
    address.county,
    address.state,
    address.country,
  ];
  const uniqueNames = [...new Set(areaNames.filter(Boolean))];
  return uniqueNames.slice(0, 3).join("، ");
}

function getLocationDetails(address = {}) {
  return {
    label: getLocationLabel(address),
    countryCode: address.country_code?.toLowerCase(),
  };
}

async function fetchClimate(latitude, longitude) {
  const url = new URL(NASA_POWER_URL);
  url.search = new URLSearchParams({
    parameters: "PRECTOTCORR,T2M",
    community: "AG",
    longitude: String(longitude),
    latitude: String(latitude),
    format: "JSON",
  }).toString();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`تعذر تحميل بيانات المناخ: ${response.status}`);
  }

  const result = await response.json();
  const parameters = result.properties?.parameter;
  const rainfall = parameters?.PRECTOTCORR?.ANN;
  const monthlyRainfall = parameters?.PRECTOTCORR;
  const temperature = parameters?.T2M?.ANN;
  if (!Number.isFinite(rainfall) || rainfall < 0 || !Number.isFinite(temperature) || !monthlyRainfall) {
    throw new Error("بيانات المناخ المستلمة غير مكتملة.");
  }

  const monthNames = {
    JAN: "يناير",
    FEB: "فبراير",
    MAR: "مارس",
    APR: "أبريل",
    MAY: "مايو",
    JUN: "يونيو",
    JUL: "يوليو",
    AUG: "أغسطس",
    SEP: "سبتمبر",
    OCT: "أكتوبر",
    NOV: "نوفمبر",
    DEC: "ديسمبر",
  };
  const rainyMonths = Object.entries(monthlyRainfall)
    .filter(([month, value]) => monthNames[month] && Number.isFinite(value) && value >= 1)
    .map(([month]) => monthNames[month]);

  return {
    annualRainMm: Math.round(rainfall * 365),
    annualTemperature: temperature,
    rainyMonths,
    period: result.header?.range ?? "الفترة المناخية التاريخية المتاحة",
  };
}

function renderClimateSummary(climate) {
  const summary = document.querySelector("#climate-summary");
  summary.replaceChildren();

  const rain = document.createElement("span");
  rain.textContent = `متوسط المطر السنوي التقريبي: ${climate.annualRainMm} مم`;
  const temperature = document.createElement("span");
  temperature.textContent = `متوسط الحرارة السنوي: ${climate.annualTemperature.toFixed(1)}°م`;
  const period = document.createElement("span");
  period.className = "climate-period";
  period.textContent = `متوسط أشهر المطر (≥ 1 مم/يوم): ${climate.rainyMonths.join("، ") || "لا تظهر أشهر تتجاوز هذا المتوسط"}`;
  const source = document.createElement("a");
  source.className = "climate-source";
  source.href = "https://power.larc.nasa.gov/";
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.textContent = `NASA POWER — ${climate.period}`;
  summary.append(rain, temperature, period, source);
}

function renderRecommendations() {
  const grid = document.querySelector("#recommendation-grid");
  const irrigation = document.querySelector("#irrigation-select").value;
  const candidates = cropCandidates[activeRecommendationCategory]
    .filter((crop) => !(crop.irrigatedOnly && irrigation === "no"));

  const cards = candidates.map((crop) => {
    const card = document.createElement("article");
    card.className = "recommendation-card";

    const title = document.createElement("h4");
    title.textContent = crop.name;

    const summary = document.createElement("p");
    summary.textContent = crop.summary;

    const condition = document.createElement("span");
    condition.className = "crop-condition";
    condition.textContent = crop.condition;

    const source = document.createElement("a");
    source.href = crop.source;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = "تحقق من المصدر ↗";

    card.append(title, summary, condition, source);
    return card;
  });
  grid.replaceChildren(...cards);
}

function showMap(latitude, longitude) {
  if (!window.L) {
    throw new Error("تعذر تحميل مكتبة الخريطة.");
  }

  if (!map) {
    map = window.L.map("map-frame").setView([latitude, longitude], 13);
    window.L.tileLayer(MAP_TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);
    locationMarker = window.L.marker([latitude, longitude]).addTo(map);
  } else {
    map.setView([latitude, longitude], 13);
    locationMarker.setLatLng([latitude, longitude]);
  }

  document.querySelector("#map-frame").classList.add("map-visible");
  map.invalidateSize();
}

async function reverseGeocode(latitude, longitude) {
  const delay = REVERSE_GEOCODE_INTERVAL_MS - (Date.now() - lastReverseGeocodeAt);
  if (delay > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, delay));
  }

  const url = new URL(GEOCODER_URL);
  url.search = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "14",
    addressdetails: "1",
    "accept-language": "ar",
  }).toString();

  lastReverseGeocodeAt = Date.now();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`تعذر التعرف على المنطقة: ${response.status}`);
  }

  const result = await response.json();
  const location = getLocationDetails(result.address);
  if (!location.label || !location.countryCode) {
    throw new Error("لم تتوفر تفاصيل كافية لاسم المنطقة في OpenStreetMap.");
  }
  return location;
}

function getGeolocationError(error) {
  if (error.code === 1) {
    return "لم تسمح بالوصول إلى موقعك. يمكنك تفعيل الإذن من إعدادات المتصفح والمحاولة مجددًا.";
  }
  if (error.code === 2) {
    return "تعذر على جهازك تحديد الموقع الحالي.";
  }
  if (error.code === 3) {
    return "انتهت مهلة تحديد الموقع. تحقق من إعدادات الموقع وحاول مجددًا.";
  }
  return "لم يتمكن المتصفح من تحديد موقعك.";
}

function requestDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("المتصفح لا يدعم تحديد الموقع."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => reject(new Error(getGeolocationError(error))),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  });
}

async function locateUser() {
  locateButton.disabled = true;
  locateButton.querySelector("span:last-child").textContent = "جارٍ تحديد الموقع…";
  locationStatus.textContent = "بانتظار إذن الموقع من جهازك…";
  document.querySelector("#recommendations").hidden = true;

  try {
    const position = await requestDeviceLocation();
    const { latitude, longitude } = position.coords;
    showMap(latitude, longitude);
    locationCoordinates.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    locationCoordinates.hidden = false;
    locationName.textContent = "تم تحديد موقعك";
    locationStatus.textContent = "جارٍ التعرف على اسم المنطقة من بيانات OpenStreetMap…";

    const area = await reverseGeocode(latitude, longitude);
    locationName.textContent = area.label;
    if (area.countryCode !== "sd") {
      locationStatus.textContent = "التوصيات متاحة حاليًا لمواقع داخل السودان فقط.";
      return;
    }

    locationStatus.textContent = "تم التعرف على المنطقة. جارٍ تحميل المناخ المحلي…";
    const climate = await fetchClimate(latitude, longitude);
    renderClimateSummary(climate);
    renderRecommendations();
    document.querySelector("#recommendations").hidden = false;
  } catch (error) {
    console.error("PlantNow location lookup failed:", error);
    locationStatus.textContent = error.message || "تعذر تحديد المنطقة.";
  } finally {
    locateButton.disabled = false;
    locateButton.querySelector("span:last-child").textContent = "حدد موقعي";
  }
}

async function loadData() {
  loadError.hidden = true;

  try {
    const response = await fetch(DATA_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`تعذر تحميل البيانات: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data.facts) || !Array.isArray(data.sources)) {
      throw new Error("ملف البيانات لا يحتوي على قائمة المؤشرات والمصادر المطلوبة.");
    }

    document.querySelector("#data-notice").textContent = data.notice;
    snapshotDate.textContent = formatDate(data.snapshotDate);
    factsGrid.replaceChildren(...data.facts.map(createFactCard));
    sourcesGrid.replaceChildren(...data.sources.map(createSourceCard));
  } catch (error) {
    console.error("PlantNow data loading failed:", error);
    loadError.hidden = false;
    factsGrid.replaceChildren();
    sourcesGrid.replaceChildren();
    snapshotDate.textContent = "غير متاح";
  }
}

document.querySelector("#retry-button").addEventListener("click", loadData);
locateButton.addEventListener("click", locateUser);
document.querySelectorAll(".recommendation-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activeRecommendationCategory = tab.dataset.category;
    document.querySelectorAll(".recommendation-tab").forEach((item) => {
      const isActive = item === tab;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });
    renderRecommendations();
  });
});
document.querySelector("#irrigation-select").addEventListener("change", renderRecommendations);
loadData();
