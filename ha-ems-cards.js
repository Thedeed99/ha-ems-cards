/**
 * HA EMS Cards — dashboardkaarten voor energiebeheer in Home Assistant.
 * Zelfde huisstijl als de Zaptec Go 2 Card: eigen achtergrond-, accent- en tekstkleur,
 * en volledige configuratie via de Lovelace UI-editor.
 */

const CARD_VERSION = "2.17.0";

console.info(
  `%c HA-EMS-CARDS %c v${CARD_VERSION} `,
  "color: #ffffff; background: #1d3b33; font-weight: 700;",
  "color: #1d3b33; background: #e8c547; font-weight: 700;"
);

const STYLE_DEFAULTS = {
  background_color: "#1d3b33",
  accent_color: "#e8c547",
  text_color: "#ffffff",
  off_color: "#ff453a",
  tile_radius: 16,
};

const SOLAR_DEFAULTS = {
  solar_color: "#34c759",
  export_color: "#0a84ff",
  import_color: "#ff453a",
  ev_color: "#ff9f0a",
  consumer_1_color: "#5e5ce6",
  consumer_2_color: "#64d2ff",
  battery_color: "#af52de",
  inverter_size: 2.5,
  battery_capacity: 10,
};

const TRANSLATIONS = {
  en: {
    flow: "Energy flow",
    solar: "Solar",
    production: "Solar",
    selfUse: "Self-consumption",
    exported: "Export",
    imported: "Import",
    usage: "Usage",
    ev: "EV",
    forecast: "Forecast",
    battery: "Battery",
    net: "Net",
    today: "Today",
    unavailable: "Unavailable",
    unknown: "Unknown",
    empty: "Add entities in the card editor.",
    add: "Add tile",
    remove: "Remove",
  },
  nl: {
    flow: "Energiestroom",
    solar: "Zonne-energie",
    production: "Zon",
    selfUse: "Eigen verbruik",
    exported: "Export",
    imported: "Import",
    usage: "Verbruik",
    ev: "EV",
    forecast: "Verwachting",
    battery: "Batterij",
    net: "Netto",
    today: "Vandaag",
    unavailable: "Niet beschikbaar",
    unknown: "Onbekend",
    empty: "Voeg entiteiten toe in de kaart-editor.",
    add: "Tegel toevoegen",
    remove: "Verwijderen",
  },
};

function toCssColor(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value) && value.length >= 3) return `rgb(${value[0]}, ${value[1]}, ${value[2]})`;
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function parseRgb(value) {
  if (Array.isArray(value) && value.length >= 3) return { r: +value[0], g: +value[1], b: +value[2] };
  if (typeof value === "string") {
    const hex = value.trim().replace("#", "");
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
    const match = value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (match) return { r: +match[1], g: +match[2], b: +match[3] };
  }
  return null;
}

function contrastColor(value, light = "#ffffff", dark = "#12241f") {
  const rgb = parseRgb(value);
  if (!rgb) return dark;
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 > 0.6 ? dark : light;
}

/** Semi-transparante tegelkleur afgeleid van de achtergrond, tenzij expliciet ingesteld. */
function tileColor(config) {
  return toCssColor(config.tile_color, "rgba(255,255,255,0.07)");
}

const SHARED_CSS = `
  :host { display: block; }
  ha-card {
    background: var(--ems-bg);
    color: var(--ems-text);
    border: none;
    border-radius: var(--ha-card-border-radius, 18px);
    padding: 16px;
    box-sizing: border-box;
    height: 100%;
    overflow: hidden;
  }
  .card-title {
    font-size: 1.05rem; font-weight: 700; text-align: center; margin-bottom: 12px;
  }
  .empty { font-size: .85rem; opacity: .7; text-align: center; padding: 12px 0; }
  .tile {
    background: var(--ems-tile);
    border-radius: var(--ems-radius);
    padding: 10px 8px;
    min-width: 0;
    cursor: pointer;
    text-align: center;
    transition: filter .15s ease;
  }
  .tile:hover { filter: brightness(1.15); }
  .tile-name {
    font-size: .69rem; font-weight: 400; opacity: .65; line-height: 1.2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tile-value {
    font-size: 1.35rem; font-weight: 700; margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tile-secondary { font-size: .68rem; opacity: .55; margin-top: 1px; }
`;

class EmsBaseCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._built = false;
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...STYLE_DEFAULTS, ...SOLAR_DEFAULTS, ...config };
    this._built = false;
    this.shadowRoot.innerHTML = "";
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _t(key) {
    const lang = (this._hass?.locale?.language || this._hass?.language || "en").slice(0, 2);
    return (TRANSLATIONS[lang] || TRANSLATIONS.en)[key] ?? TRANSLATIONS.en[key];
  }

  _state(entityId) {
    return entityId && this._hass ? this._hass.states[entityId] : undefined;
  }

  _isOn(entityId) {
    const stateObj = this._state(entityId);
    return !!stateObj && ["on", "open", "home", "heat", "cool", "true"].includes(stateObj.state);
  }

  /** Rondt numerieke waarden af en houdt de eenheid van de entiteit aan. */
  _formatValue(entityId, decimals = 0) {
    const stateObj = this._state(entityId);
    if (!stateObj) return "—";
    if (["unavailable", "unknown"].includes(stateObj.state)) {
      return this._t(stateObj.state === "unavailable" ? "unavailable" : "unknown");
    }
    const numeric = Number(stateObj.state);
    const unit = stateObj.attributes.unit_of_measurement;
    if (Number.isFinite(numeric)) {
      return `${this._formatNumber(numeric, decimals)}${unit ? ` ${unit}` : ""}`;
    }
    if (this._hass.formatEntityState) {
      try {
        return this._hass.formatEntityState(stateObj);
      } catch (err) {
        /* valt terug op de ruwe state */
      }
    }
    return stateObj.state;
  }

  /** Getal met scheidingsteken voor duizendtallen volgens de taal van Home Assistant. */
  _formatNumber(value, decimals = 0) {
    if (!Number.isFinite(value)) return "—";
    const language = this._hass?.locale?.language || this._hass?.language || "nl";
    let text = value.toLocaleString(language, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    const separator = this._config?.thousands_separator;
    if (separator && separator !== "auto") {
      const current = new Intl.NumberFormat(language)
        .formatToParts(1000)
        .find((part) => part.type === "group")?.value;
      const replacement = separator === "geen" ? "" : separator;
      if (current) text = text.split(current).join(replacement);
      else if (replacement) {
        const [whole, fraction] = text.split(/[.,]/);
        const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, replacement);
        text = fraction ? `${grouped}${text.charAt(whole.length)}${fraction}` : grouped;
      }
    }
    return text;
  }

  /** Leest een vermogenssensor uit en rekent kW om naar W. */
  _power(entityId) {
    const stateObj = this._state(entityId);
    const numeric = Number(stateObj?.state);
    if (!Number.isFinite(numeric)) return 0;
    return /kw/i.test(stateObj.attributes.unit_of_measurement || "") ? numeric * 1000 : numeric;
  }

  /** Toont W of kW, afhankelijk van de ingestelde eenheid. */
  _formatPower(watts) {
    if (this._config.power_unit === "kW") {
      return `${this._formatNumber(watts / 1000, Number(this._config.decimals) ?? 2)} kW`;
    }
    return `${this._formatNumber(watts, Number(this._config.decimals) || 0)} W`;
  }

  _friendlyName(entityId) {
    return this._state(entityId)?.attributes?.friendly_name || entityId || "";
  }

  _fireMoreInfo(entityId) {
    if (!entityId) return;
    const event = new Event("hass-more-info", { bubbles: true, composed: true });
    event.detail = { entityId };
    this.dispatchEvent(event);
  }

  _tap(item) {
    const target = item.switch_entity || item.entity;
    if (!target || !this._hass) return;
    const domain = target.split(".")[0];
    if (item.switch_entity && ["switch", "light", "input_boolean", "fan"].includes(domain)) {
      this._hass.callService(domain, "toggle", { entity_id: target });
      return;
    }
    this._fireMoreInfo(target);
  }

  _applyColors(card) {
    const cfg = this._config;
    card.style.setProperty("--ems-bg", toCssColor(cfg.background_color, STYLE_DEFAULTS.background_color));
    card.style.setProperty("--ems-accent", toCssColor(cfg.accent_color, STYLE_DEFAULTS.accent_color));
    card.style.setProperty("--ems-text", toCssColor(cfg.text_color, STYLE_DEFAULTS.text_color));
    card.style.setProperty("--ems-off", toCssColor(cfg.off_color, STYLE_DEFAULTS.off_color));
    card.style.setProperty("--ems-tile", tileColor(cfg));
    card.style.setProperty("--ems-radius", `${Number(cfg.tile_radius) || STYLE_DEFAULTS.tile_radius}px`);
    card.style.setProperty("--ems-on-accent", contrastColor(cfg.accent_color || STYLE_DEFAULTS.accent_color));
    card.style.setProperty("--ems-solar", toCssColor(cfg.solar_color, SOLAR_DEFAULTS.solar_color));
    card.style.setProperty("--ems-export", toCssColor(cfg.export_color, SOLAR_DEFAULTS.export_color));
    card.style.setProperty("--ems-import", toCssColor(cfg.import_color, SOLAR_DEFAULTS.import_color));
    card.style.setProperty("--ems-ev", toCssColor(cfg.ev_color, SOLAR_DEFAULTS.ev_color));
    card.style.setProperty("--ems-battery", toCssColor(cfg.battery_color, SOLAR_DEFAULTS.battery_color));
  }
}

class EmsOverviewCard extends EmsBaseCard {
  static getConfigElement() {
    return document.createElement("ems-overview-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:ems-overview-card",
      title: "Real-time verbruik",
      flow_max: 2500,
      tiles: [],
      ...STYLE_DEFAULTS,
    };
  }

  getCardSize() {
    return 6;
  }

  _build() {
    const cfg = this._config;
    const root = this.shadowRoot;
    root.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = `
      ${SHARED_CSS}
      .weather { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: .95rem; }
      .weather ha-icon { --mdc-icon-size: 22px; }
      .tiles { display: grid; gap: 8px; grid-template-columns: repeat(var(--ems-columns, 3), minmax(0, 1fr)); }
      .flow { margin-top: 16px; }
      .flow-head { display: flex; justify-content: space-between; align-items: baseline; }
      .flow-title { font-size: .95rem; font-weight: 600; }
      .flow-range { font-size: .72rem; opacity: .55; }
      .flow-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
      .flow-icon {
        width: 34px; height: 34px; border-radius: 50%; flex: none;
        display: flex; align-items: center; justify-content: center;
        background: var(--ems-tile); color: var(--ems-text);
      }
      .flow-icon[data-active="true"] { background: var(--ems-accent); color: var(--ems-on-accent); }
      .flow-icon ha-icon { --mdc-icon-size: 18px; }
      .flow-track {
        position: relative; flex: 1; height: 26px; border-radius: 13px;
        background: var(--ems-tile); overflow: hidden;
      }
      .flow-fill {
        position: absolute; inset: 0 auto 0 0; width: 0%;
        background: var(--ems-accent); opacity: .85; transition: width .5s ease;
      }
      .flow-dots { position: relative; height: 4px; margin-top: 6px; margin-left: 42px; margin-right: 42px;
        border-radius: 2px; background: var(--ems-tile); overflow: hidden; }
      .flow-dots::after {
        content: ""; position: absolute; top: 0; bottom: 0; width: 40%;
        background: linear-gradient(90deg, transparent, var(--ems-accent), transparent);
        animation: ems-sweep 2s linear infinite;
      }
      @keyframes ems-sweep {
        from { transform: translateX(-100%); }
        to { transform: translateX(350%); }
      }
      .flow[data-flowing="false"] .flow-dots::after { animation: none; opacity: 0; }
      .solar { margin-top: 16px; }
      .solar-head { display: flex; justify-content: space-between; align-items: baseline; }
      .solar-title { font-size: .95rem; font-weight: 600; }
      .solar-scale { font-size: .72rem; opacity: .55; }
      .solar-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
      .solar-icon {
        width: 34px; height: 34px; border-radius: 50%; flex: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        background: var(--ems-tile); color: var(--ems-text);
        border: 2px solid transparent; transition: background .3s ease, border-color .3s ease;
      }
      .solar-icon ha-icon { --mdc-icon-size: 18px; }
      .solar-track {
        position: relative; display: flex; flex: 1; height: 30px; border-radius: 15px;
        background: var(--ems-tile); overflow: hidden;
      }
      .solar-seg {
        height: 100%; width: 0%; overflow: hidden; transition: width .5s ease;
        display: flex; align-items: center; justify-content: center;
        font-size: .66rem; font-weight: 600; white-space: nowrap;
      }
      .solar-forecast {
        position: absolute; top: 0; bottom: 0; width: 0; left: 0;
        border-left: 2px dotted var(--ems-accent); transition: left .5s ease;
      }
      .solar-today { font-size: .72rem; opacity: .6; margin-top: 6px; cursor: pointer; }
      .solar-legend {
        display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; font-size: .72rem;
      }
      .solar-legend div { display: flex; align-items: center; gap: 5px; opacity: .85; cursor: pointer; }
      .solar-legend i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
      .solar-legend b { font-weight: 600; }
      .solar-track[data-flowing="true"]::after {
        content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 30%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent);
        animation: ems-sweep var(--ems-sweep-speed, 2s) linear infinite; pointer-events: none;
      }
      .seg-potential {
        background-image: repeating-linear-gradient(
          45deg, rgba(255,255,255,.22) 0 4px, transparent 4px 8px
        );
      }
      .battery {
        position: relative; height: 30px; border-radius: 15px; flex: none;
        background: var(--ems-tile); overflow: hidden; cursor: pointer;
      }
      .battery-fill {
        position: absolute; left: 0; right: 0; bottom: 0; height: 0%;
        background: var(--ems-battery); transition: height .5s ease;
      }
      .battery-soc {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-size: .62rem; font-weight: 700;
      }
      .battery[data-flow="charge"]::after, .battery[data-flow="discharge"]::after {
        content: ""; position: absolute; left: 0; right: 0; height: 40%;
        background: linear-gradient(180deg, transparent, rgba(255,255,255,.4), transparent);
        animation: ems-battery-sweep var(--ems-sweep-speed, 2s) linear infinite;
      }
      .battery[data-flow="discharge"]::after { animation-direction: reverse; }
      @keyframes ems-battery-sweep {
        from { transform: translateY(-100%); }
        to { transform: translateY(250%); }
      }
      .stats { display: grid; gap: 8px; margin-top: 12px;
        grid-template-columns: repeat(var(--ems-columns, 3), minmax(0, 1fr)); }
      .stat-detail { font-size: .66rem; opacity: .6; margin-top: 1px;
        display: flex; align-items: center; justify-content: center; gap: 4px; }
      .stat-detail i { width: 6px; height: 6px; border-radius: 50%; flex: none; }
    `;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    this._card = card;

    if (cfg.title) {
      const title = document.createElement("div");
      title.className = "card-title";
      title.textContent = cfg.title;
      card.appendChild(title);
    }

    if (cfg.weather_entity) {
      const weather = document.createElement("div");
      weather.className = "weather";
      this._weatherIcon = document.createElement("ha-icon");
      this._weatherText = document.createElement("span");
      weather.append(this._weatherIcon, this._weatherText);
      weather.addEventListener("click", () => this._fireMoreInfo(cfg.weather_entity));
      card.appendChild(weather);
    }

    if (cfg.production_entity) {
      const solar = document.createElement("div");
      solar.className = "solar";

      const head = document.createElement("div");
      head.className = "solar-head";
      const solarTitle = document.createElement("span");
      solarTitle.className = "solar-title";
      solarTitle.textContent = cfg.solar_name || this._t("solar");
      this._solarScale = document.createElement("span");
      this._solarScale.className = "solar-scale";
      head.append(solarTitle, this._solarScale);

      const row = document.createElement("div");
      row.className = "solar-row";

      this._houseIcon = document.createElement("div");
      this._houseIcon.className = "solar-icon";
      this._houseIcon.innerHTML = '<ha-icon icon="mdi:home"></ha-icon>';
      this._houseIcon.addEventListener("click", () =>
        this._fireMoreInfo(cfg.self_consumption_entity || cfg.production_entity)
      );
      row.appendChild(this._houseIcon);

      if (cfg.ev_entity) {
        this._evIcon = document.createElement("div");
        this._evIcon.className = "solar-icon";
        this._evIcon.innerHTML = '<ha-icon icon="mdi:car-electric"></ha-icon>';
        this._evIcon.addEventListener("click", () => this._fireMoreInfo(cfg.ev_entity));
        row.appendChild(this._evIcon);
      }

      const track = document.createElement("div");
      track.className = "solar-track";
      this._segmentDefs = this._buildSegmentDefs();
      this._solarSegs = {};
      for (const def of this._segmentDefs) {
        const seg = document.createElement("div");
        seg.className = def.className ? `solar-seg ${def.className}` : "solar-seg";
        seg.style.background = def.color;
        if (def.dim) seg.style.opacity = ".55";
        seg.title = def.label;
        seg.addEventListener("click", () => this._fireMoreInfo(def.entity));
        track.appendChild(seg);
        this._solarSegs[def.key] = seg;
      }

      if (cfg.forecast_entity) {
        this._solarForecast = document.createElement("div");
        this._solarForecast.className = "solar-forecast";
        track.appendChild(this._solarForecast);
      }
      row.appendChild(track);

      if (cfg.grid_power_entity || cfg.import_entity || cfg.export_entity) {
        this._gridIcon = document.createElement("div");
        this._gridIcon.className = "solar-icon";
        this._gridIcon.innerHTML = '<ha-icon icon="mdi:transmission-tower"></ha-icon>';
        this._gridIcon.addEventListener("click", () =>
          this._fireMoreInfo(cfg.grid_power_entity || cfg.import_entity || cfg.export_entity)
        );
        row.appendChild(this._gridIcon);
      }

      if (cfg.battery_soc_entity && cfg.show_battery_indicator !== false) {
        this._batteryEl = document.createElement("div");
        this._batteryEl.className = "battery";
        const capacity = Number(cfg.battery_capacity) || SOLAR_DEFAULTS.battery_capacity;
        const inverter = Number(cfg.inverter_size) || SOLAR_DEFAULTS.inverter_size;
        const share = Math.max(12, Math.min(45, (capacity / (capacity + inverter * 4)) * 100));
        this._batteryEl.style.width = `${share}px`;
        this._batteryFill = document.createElement("div");
        this._batteryFill.className = "battery-fill";
        this._batterySoc = document.createElement("div");
        this._batterySoc.className = "battery-soc";
        this._batteryEl.append(this._batteryFill, this._batterySoc);
        this._batteryEl.addEventListener("click", () => this._fireMoreInfo(cfg.battery_soc_entity));
        row.appendChild(this._batteryEl);
      }

      solar.append(head, row);

      if (cfg.production_history_entity) {
        this._todayEl = document.createElement("div");
        this._todayEl.className = "solar-today";
        this._todayEl.addEventListener("click", () =>
          this._fireMoreInfo(cfg.production_history_entity)
        );
        solar.appendChild(this._todayEl);
      }

      if (cfg.show_solar_legend !== false) {
        const legend = document.createElement("div");
        legend.className = "solar-legend";
        this._legendEls = {};
        const legendDefs = [
          { key: "production", color: "var(--ems-solar)", entity: cfg.production_entity, label: this._t("production") },
          { key: "usage", color: "var(--ems-text)", entity: cfg.self_consumption_entity, label: this._t("usage") },
          { key: "imported", color: "var(--ems-import)", entity: cfg.grid_power_entity || cfg.import_entity, label: this._t("imported") },
          { key: "exported", color: "var(--ems-export)", entity: cfg.grid_power_entity || cfg.export_entity, label: this._t("exported") },
          { key: "ev", color: "var(--ems-ev)", entity: cfg.ev_entity, label: cfg.ev_name || this._t("ev") },
          ...this._consumers().map((consumer, index) => ({
            key: `consumer_${index}`,
            color: consumerColor(consumer, index),
            entity: consumer.entity,
            label: consumer.name || this._friendlyName(consumer.entity),
          })),
        ].filter((def) => def.entity);
        for (const def of legendDefs) {
          const item = document.createElement("div");
          const dot = document.createElement("i");
          dot.style.background = def.color;
          const label = document.createElement("span");
          label.textContent = def.label;
          const value = document.createElement("b");
          item.append(dot, label, value);
          item.addEventListener("click", () => this._fireMoreInfo(def.entity));
          legend.appendChild(item);
          this._legendEls[def.key] = value;
        }
        solar.appendChild(legend);
      }

      card.appendChild(solar);
    }

    this._autoStats = [];
    if (cfg.production_entity && cfg.show_stats !== false) {
      const statDefs = [
        { key: "production", label: this._t("production"), entity: cfg.production_entity, history: cfg.production_history_entity },
        { key: "usage", label: this._t("usage"), entity: cfg.self_consumption_entity, history: cfg.consumption_history_entity },
        { key: "grid", label: this._t("imported"), entity: cfg.grid_power_entity || cfg.import_entity, history: null },
        { key: "battery", label: this._t("battery"), entity: cfg.battery_soc_entity, history: null },
        { key: "ev", label: cfg.ev_name || this._t("ev"), entity: cfg.ev_entity, history: cfg.ev_history_entity },
        ...this._consumers().map((consumer, index) => ({
          key: `consumer_${index}`,
          label: consumer.name || this._friendlyName(consumer.entity),
          entity: consumer.entity,
          history: consumer.history_entity,
        })),
      ].filter((def) => def.entity);

      if (statDefs.length) {
        const stats = document.createElement("div");
        stats.className = "stats";
        stats.style.setProperty("--ems-columns", String(Number(cfg.columns) || 3));
        for (const def of statDefs) {
          const tile = document.createElement("div");
          tile.className = "tile";
          const name = document.createElement("div");
          name.className = "tile-name";
          const value = document.createElement("div");
          value.className = "tile-value";
          tile.append(name, value);
          let detail = null;
          let dot = null;
          if (cfg.show_stats_detail !== false) {
            detail = document.createElement("div");
            detail.className = "stat-detail";
            dot = document.createElement("i");
            const text = document.createElement("span");
            detail.append(dot, text);
            tile.appendChild(detail);
            detail = text;
          }
          tile.addEventListener("click", () => this._fireMoreInfo(def.entity));
          stats.appendChild(tile);
          this._autoStats.push({ def, name, value, detail, dot });
        }
        card.appendChild(stats);
      }
    }

    this._tileEls = [];
    const tiles = Array.isArray(cfg.tiles) ? cfg.tiles.filter((tile) => tile && tile.entity) : [];
    if (tiles.length) {
      const grid = document.createElement("div");
      grid.className = "tiles";
      grid.style.setProperty("--ems-columns", String(Number(cfg.columns) || 3));
      for (const tile of tiles) {
        const el = document.createElement("div");
        el.className = "tile";
        const name = document.createElement("div");
        name.className = "tile-name";
        name.textContent = tile.name || this._friendlyName(tile.entity);
        const value = document.createElement("div");
        value.className = "tile-value";
        el.append(name, value);
        let secondary = null;
        if (tile.secondary_entity) {
          secondary = document.createElement("div");
          secondary.className = "tile-secondary";
          el.appendChild(secondary);
        }
        el.addEventListener("click", () => this._tap(tile));
        grid.appendChild(el);
        this._tileEls.push({ tile, value, secondary });
      }
      card.appendChild(grid);
    }

    if (cfg.flow_entity) {
      const flow = document.createElement("div");
      flow.className = "flow";
      this._flowEl = flow;

      const head = document.createElement("div");
      head.className = "flow-head";
      const flowTitle = document.createElement("span");
      flowTitle.className = "flow-title";
      flowTitle.textContent = cfg.flow_name || this._t("flow");
      this._flowRange = document.createElement("span");
      this._flowRange.className = "flow-range";
      head.append(flowTitle, this._flowRange);

      const row = document.createElement("div");
      row.className = "flow-row";
      this._flowLeft = document.createElement("div");
      this._flowLeft.className = "flow-icon";
      const leftIcon = document.createElement("ha-icon");
      leftIcon.setAttribute("icon", cfg.flow_left_icon || "mdi:home");
      this._flowLeft.appendChild(leftIcon);

      this._flowRight = document.createElement("div");
      this._flowRight.className = "flow-icon";
      const rightIcon = document.createElement("ha-icon");
      rightIcon.setAttribute("icon", cfg.flow_right_icon || "mdi:transmission-tower");
      this._flowRight.appendChild(rightIcon);

      const track = document.createElement("div");
      track.className = "flow-track";
      this._flowFill = document.createElement("div");
      this._flowFill.className = "flow-fill";
      track.appendChild(this._flowFill);

      row.append(this._flowLeft, track, this._flowRight);

      const dots = document.createElement("div");
      dots.className = "flow-dots";
      for (let index = 0; index < 10; index += 1) {
        const dot = document.createElement("span");
        dot.style.animationDelay = `${index * 0.12}s`;
        dots.appendChild(dot);
      }

      flow.append(head, row, dots);
      flow.addEventListener("click", () => this._fireMoreInfo(cfg.flow_entity));
      card.appendChild(flow);
    }

    if (!tiles.length && !cfg.flow_entity && !cfg.production_entity) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = this._t("empty");
      card.appendChild(empty);
    }

    root.appendChild(card);
    this._built = true;
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._built) this._build();
    this._applyColors(this._card);
    const cfg = this._config;

    if (this._weatherText) {
      const weatherObj = this._state(cfg.weather_entity);
      const temperature = weatherObj?.attributes?.temperature;
      this._weatherIcon.setAttribute("icon", weatherIcon(weatherObj?.state));
      this._weatherText.textContent =
        temperature === undefined
          ? weatherObj?.state ?? "—"
          : `${Number(temperature).toFixed(1)} ${this._hass.config?.unit_system?.temperature || "°C"}`;
    }

    for (const { tile, value, secondary } of this._tileEls) {
      value.textContent = this._formatValue(tile.entity, Number(tile.decimals) || 0);
      value.style.color =
        tile.switch_entity && !this._isOn(tile.switch_entity) ? "var(--ems-off)" : "var(--ems-text)";
      if (secondary) {
        secondary.textContent = this._formatValue(tile.secondary_entity, Number(tile.secondary_decimals) ?? 2);
      }
    }

    if (this._flowEl) {
      const raw = Number(this._state(cfg.flow_entity)?.state);
      const value = Number.isFinite(raw) ? raw : 0;
      const max = this._scaleFor(Number(cfg.flow_max) || 2500, Math.abs(value), cfg.flow_auto_scale);
      const percentage = Math.max(0, Math.min(100, (Math.abs(value) / max) * 100));
      this._flowFill.style.width = `${percentage}%`;
      this._flowRange.textContent = `0 - ${this._formatNumber(max)} W`;
      this._flowEl.dataset.flowing = String(Math.abs(value) > (Number(cfg.flow_threshold) || 0));
      this._flowLeft.dataset.active = String(value > 0);
      this._flowRight.dataset.active = String(value < 0);
    }

    if (this._solarSegs) {
      const flows = this._calculateFlows();
      this._flows = flows;
      const total = Object.values(flows.segments).reduce((sum, watts) => sum + watts, 0);
      const scale = this._scaleFor(
        (Number(cfg.inverter_size) || SOLAR_DEFAULTS.inverter_size) * 1000,
        Math.max(total, flows.production, flows.usage),
        cfg.auto_scale
      );
      const percentage = (watts) => Math.max(0, Math.min(100, (watts / scale) * 100));

      for (const def of this._segmentDefs) {
        const seg = this._solarSegs[def.key];
        const watts = flows.segments[def.key] || 0;
        const width = percentage(watts);
        seg.style.width = `${width}%`;
        seg.textContent = cfg.show_bar_values !== false && width >= 14 ? this._formatPower(watts) : "";
        seg.style.color = contrastColor(def.raw_color || "#000000");
      }

      this._solarScale.textContent = `0 - ${this._formatPower(scale)}`;

      if (this._solarForecast) {
        const forecast = this._power(cfg.forecast_entity);
        this._solarForecast.style.left = `${percentage(forecast)}%`;
        this._solarForecast.style.display = forecast > flows.production ? "" : "none";
      }

      if (this._houseIcon) {
        this._houseIcon.style.borderColor = flows.homeSolar > 0 ? "var(--ems-solar)" : "transparent";
      }
      if (this._evIcon) {
        const charging = flows.ev > 0;
        this._evIcon.style.background = charging ? "var(--ems-ev)" : "var(--ems-tile)";
        this._evIcon.style.borderColor =
          !charging && flows.exported > 0 ? "var(--ems-ev)" : "transparent";
      }
      if (this._gridIcon) {
        const idle = flows.imported === 0 && flows.exported === 0;
        this._gridIcon.style.background = flows.exported > 0
          ? "var(--ems-export)"
          : flows.imported > 0
            ? "var(--ems-import)"
            : "var(--ems-tile)";
        this._gridIcon.style.display = idle && cfg.show_grid_icon_always === false ? "none" : "";
      }

      if (this._todayEl) {
        this._todayEl.textContent = `${this._t("today")}: ${this._formatValue(
          cfg.production_history_entity,
          Number(cfg.energy_decimals) ?? 1
        )}`;
      }

      if (this._legendEls) {
        for (const [key, el] of Object.entries(this._legendEls)) {
          el.textContent = this._formatPower(flows.legend[key] ?? 0);
        }
      }

      const track = this._solarSegs.home_solar?.parentElement;
      if (track) {
        const active = flows.production > 0 || flows.imported > 0 || flows.exported > 0;
        track.dataset.flowing = String(cfg.disable_animation !== true && active);
        track.style.setProperty("--ems-sweep-speed", `${Number(cfg.animation_speed) || 2}s`);
      }

      if (this._batteryEl) {
        const soc = Number(this._state(cfg.battery_soc_entity)?.state);
        const level = Number.isFinite(soc) ? Math.max(0, Math.min(100, soc)) : 0;
        this._batteryFill.style.height = `${level}%`;
        this._batterySoc.textContent = `${this._formatNumber(level, Number(cfg.battery_soc_decimals) || 0)}%`;
        this._batteryEl.dataset.flow =
          cfg.show_battery_flow === false
            ? "idle"
            : flows.batteryCharge > 0
              ? "charge"
              : flows.batteryDischarge > 0
                ? "discharge"
                : "idle";
      }
    }

    for (const stat of this._autoStats || []) {
      const { def, name, value, detail, dot } = stat;
      const flows = this._flows || this._calculateFlows();      if (def.key === "grid") {
        const exporting = flows.exported > 0;
        name.textContent = exporting ? this._t("exported") : this._t("imported");
        value.textContent = this._formatPower(exporting ? flows.exported : flows.imported);
      } else if (def.key === "battery") {
        name.textContent = def.label;
        value.textContent = this._formatPower(
          flows.batteryCharge > 0 ? flows.batteryCharge : flows.batteryDischarge
        );
      } else {
        name.textContent = def.label;
        value.textContent = this._formatPower(flows.legend[def.key] ?? this._power(def.entity));
      }

      if (detail) {
        if (def.key === "grid") {
          const importToday = Number(this._state(cfg.import_history_entity)?.state) || 0;
          const exportToday = Number(this._state(cfg.export_history_entity)?.state) || 0;
          const net = exportToday - importToday;
          detail.textContent =
            cfg.import_history_entity || cfg.export_history_entity
              ? `${net >= 0 ? "+" : ""}${this._formatNumber(net, 1)} kWh`
              : "";
          dot.style.background = net >= 0 ? "var(--ems-solar)" : "var(--ems-import)";
          dot.style.display = detail.textContent && cfg.show_net_indicator !== false ? "" : "none";
        } else if (def.key === "battery") {
          detail.textContent = this._formatValue(cfg.battery_soc_entity, Number(cfg.battery_soc_decimals) || 0);
          dot.style.display = "none";
        } else {
          detail.textContent = def.history ? this._formatValue(def.history, 1) : "";
          dot.style.display = "none";
        }
      }
    }
  }

  /** Vergroot de schaal naar een rond getal zodra het vermogen erboven komt. */
  _scaleFor(base, value, autoScale) {
    if (autoScale === false || !Number.isFinite(value) || value <= base) return base;
    const step = base >= 5000 ? 1000 : 500;
    return Math.ceil((value * 1.05) / step) * step;
  }

  /** Verdeelt de zonneproductie over huis, verbruikers en laadpaal; de rest komt van het net. */
  _calculateFlows() {
    const cfg = this._config;
    const production = this._power(cfg.production_entity);

    let exported;
    let imported;
    if (cfg.grid_power_entity) {
      let grid = this._power(cfg.grid_power_entity);
      if (cfg.invert_grid_power) grid = -grid;
      exported = Math.max(grid, 0);
      imported = Math.max(-grid, 0);
    } else {
      exported = this._power(cfg.export_entity);
      imported = this._power(cfg.import_entity);
    }

    const usage = cfg.self_consumption_entity
      ? this._power(cfg.self_consumption_entity)
      : Math.max(production - exported + imported, 0);

    const ev = this._power(cfg.ev_entity);
    const consumers = this._consumers().map((consumer) => ({
      consumer,
      power: this._power(consumer.entity),
    }));

    let batteryCharge = 0;
    let batteryDischarge = 0;
    if (cfg.battery_power_entity) {
      let batteryPower = this._power(cfg.battery_power_entity);
      if (cfg.invert_battery_power) batteryPower = -batteryPower;
      batteryCharge = Math.max(batteryPower, 0);
      batteryDischarge = Math.max(-batteryPower, 0);
    } else {
      batteryCharge = this._power(cfg.battery_charge_entity);
      batteryDischarge = this._power(cfg.battery_discharge_entity);
    }

    const trackedTotal = ev + consumers.reduce((total, item) => total + item.power, 0);
    const homeRest = Math.max(usage - trackedTotal, 0);

    let solarLeft = Math.max(production - exported - batteryCharge, 0);
    let batteryLeft = batteryDischarge;
    const take = (amount) => {
      const solarPart = Math.min(solarLeft, amount);
      solarLeft -= solarPart;
      const batteryPart = Math.min(batteryLeft, amount - solarPart);
      batteryLeft -= batteryPart;
      return {
        solar: solarPart,
        battery: batteryPart,
        grid: Math.max(amount - solarPart - batteryPart, 0),
      };
    };

    const homeSplit = take(homeRest);
    const consumerSplits = consumers.map((item) => take(item.power));
    const evSplit = take(ev);
    const evPotential = Math.max((Number(cfg.car_charger_load) || 0) * 1000 - ev, 0);

    const segments = {
      home_solar: homeSplit.solar,
      home_battery: homeSplit.battery,
      home_grid: homeSplit.grid,
      battery_charge: batteryCharge,
      ev_potential: cfg.car_charger_load ? evPotential : 0,
      export: exported,
    };
    const legend = {
      production,
      usage,
      imported,
      exported,
      ev,
      battery: batteryCharge > 0 ? batteryCharge : batteryDischarge,
    };
    consumerSplits.forEach((split, index) => {
      segments[`consumer_${index}_solar`] = split.solar;
      segments[`consumer_${index}_battery`] = split.battery;
      segments[`consumer_${index}_grid`] = split.grid;
      legend[`consumer_${index}`] = consumers[index].power;
    });
    segments.ev_solar = evSplit.solar;
    segments.ev_battery = evSplit.battery;
    segments.ev_grid = evSplit.grid;

    return {
      production,
      usage,
      imported,
      exported,
      ev,
      batteryCharge,
      batteryDischarge,
      homeSolar: homeSplit.solar,
      segments,
      legend,
    };
  }

  /** Verbruikers uit de nieuwe lijst of uit de losse velden. */
  _consumers() {
    const cfg = this._config;
    const list = Array.isArray(cfg.consumers) ? cfg.consumers.filter((item) => item && item.entity) : [];
    if (list.length) return list;
    const legacy = [];
    if (cfg.consumer_1_entity) {
      legacy.push({
        entity: cfg.consumer_1_entity,
        name: cfg.consumer_1_name,
        color: cfg.consumer_1_color,
        history_entity: cfg.consumer_1_history_entity,
      });
    }
    if (cfg.consumer_2_entity) {
      legacy.push({
        entity: cfg.consumer_2_entity,
        name: cfg.consumer_2_name,
        color: cfg.consumer_2_color,
        history_entity: cfg.consumer_2_history_entity,
      });
    }
    return legacy;
  }

  _buildSegmentDefs() {
    const cfg = this._config;
    const batteryColor = toCssColor(cfg.battery_color, SOLAR_DEFAULTS.battery_color);
    const defs = [
      {
        key: "home_solar",
        color: "var(--ems-solar)",
        raw_color: toCssColor(cfg.solar_color, SOLAR_DEFAULTS.solar_color),
        label: this._t("selfUse"),
        entity: cfg.self_consumption_entity || cfg.production_entity,
      },
      {
        key: "home_battery",
        color: batteryColor,
        raw_color: batteryColor,
        label: this._t("battery"),
        entity: cfg.battery_soc_entity,
      },
    ];

    this._consumers().forEach((consumer, index) => {
      const color = consumerColor(consumer, index);
      defs.push({
        key: `consumer_${index}_solar`,
        color,
        raw_color: color,
        label: consumer.name || this._friendlyName(consumer.entity),
        entity: consumer.entity,
      });
      defs.push({
        key: `consumer_${index}_battery`,
        color,
        raw_color: color,
        dim: true,
        label: consumer.name || this._friendlyName(consumer.entity),
        entity: consumer.entity,
      });
      defs.push({
        key: `consumer_${index}_grid`,
        color,
        raw_color: color,
        dim: true,
        label: consumer.name || this._friendlyName(consumer.entity),
        entity: consumer.entity,
      });
    });

    if (cfg.ev_entity) {
      const color = toCssColor(cfg.ev_color, SOLAR_DEFAULTS.ev_color);
      defs.push({ key: "ev_solar", color: "var(--ems-ev)", raw_color: color, label: cfg.ev_name || this._t("ev"), entity: cfg.ev_entity });
      defs.push({ key: "ev_battery", color: "var(--ems-ev)", raw_color: color, dim: true, label: cfg.ev_name || this._t("ev"), entity: cfg.ev_entity });
      defs.push({ key: "ev_grid", color: "var(--ems-ev)", raw_color: color, dim: true, label: cfg.ev_name || this._t("ev"), entity: cfg.ev_entity });
      if (cfg.car_charger_load) {
        defs.push({
          key: "ev_potential",
          color: "transparent",
          raw_color: "#888888",
          className: "seg-potential",
          label: cfg.ev_name || this._t("ev"),
          entity: cfg.ev_entity,
        });
      }
    }

    defs.push({
      key: "battery_charge",
      color: batteryColor,
      raw_color: batteryColor,
      label: this._t("battery"),
      entity: cfg.battery_soc_entity || cfg.battery_power_entity,
    });

    defs.push({
      key: "home_grid",
      color: "var(--ems-import)",
      raw_color: toCssColor(cfg.import_color, SOLAR_DEFAULTS.import_color),
      label: this._t("imported"),
      entity: cfg.grid_power_entity || cfg.import_entity,
    });
    defs.push({
      key: "export",
      color: "var(--ems-export)",
      raw_color: toCssColor(cfg.export_color, SOLAR_DEFAULTS.export_color),
      label: this._t("exported"),
      entity: cfg.grid_power_entity || cfg.export_entity,
    });

    return defs;
  }
}

const CONSUMER_PALETTE = ["#5e5ce6", "#64d2ff", "#bf5af2", "#ff375f", "#30d158", "#ffd60a"];

function consumerColor(consumer, index) {
  return toCssColor(consumer.color, CONSUMER_PALETTE[index % CONSUMER_PALETTE.length]);
}

function weatherIcon(state) {
  const icons = {
    "clear-night": "mdi:weather-night",
    cloudy: "mdi:weather-cloudy",
    fog: "mdi:weather-fog",
    hail: "mdi:weather-hail",
    lightning: "mdi:weather-lightning",
    "lightning-rainy": "mdi:weather-lightning-rainy",
    partlycloudy: "mdi:weather-partly-cloudy",
    pouring: "mdi:weather-pouring",
    rainy: "mdi:weather-rainy",
    snowy: "mdi:weather-snowy",
    "snowy-rainy": "mdi:weather-snowy-rainy",
    sunny: "mdi:weather-sunny",
    windy: "mdi:weather-windy",
    "windy-variant": "mdi:weather-windy-variant",
    exceptional: "mdi:alert-circle-outline",
  };
  return icons[state] || "mdi:weather-partly-cloudy";
}

class EmsDevicesCard extends EmsBaseCard {
  static getConfigElement() {
    return document.createElement("ems-devices-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:ems-devices-card",
      columns: 3,
      devices: [],
      ...STYLE_DEFAULTS,
    };
  }

  getCardSize() {
    const devices = Array.isArray(this._config.devices) ? this._config.devices.length : 0;
    return 1 + Math.ceil(devices / (Number(this._config.columns) || 3));
  }

  _build() {
    const cfg = this._config;
    const root = this.shadowRoot;
    root.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = `
      ${SHARED_CSS}
      ha-card { background: transparent; padding: 0; }
      .grid { display: grid; gap: 8px; grid-template-columns: repeat(var(--ems-columns, 3), minmax(0, 1fr)); }
      .tile {
        background: var(--ems-bg);
        display: flex; flex-direction: column; justify-content: center;
        min-height: 80px; padding: 8px;
      }
      .tile-name { font-size: var(--ems-name-size, 11px); font-weight: 400; }
      .tile-value { font-size: var(--ems-value-size, 26px); font-weight: 700; }
    `;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    this._card = card;

    if (cfg.title) {
      const title = document.createElement("div");
      title.className = "card-title";
      title.textContent = cfg.title;
      card.appendChild(title);
    }

    this._deviceEls = [];
    const devices = Array.isArray(cfg.devices) ? cfg.devices.filter((device) => device && device.entity) : [];

    if (!devices.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = this._t("empty");
      card.appendChild(empty);
    } else {
      const grid = document.createElement("div");
      grid.className = "grid";
      grid.style.setProperty("--ems-columns", String(Number(cfg.columns) || 3));
      for (const device of devices) {
        const tile = document.createElement("div");
        tile.className = "tile";
        const name = document.createElement("div");
        name.className = "tile-name";
        name.textContent = device.name || this._friendlyName(device.entity);
        const value = document.createElement("div");
        value.className = "tile-value";
        tile.append(name, value);
        tile.addEventListener("click", () => this._tap(device));
        grid.appendChild(tile);
        this._deviceEls.push({ device, value });
      }
      card.appendChild(grid);
    }

    root.appendChild(card);
    this._built = true;
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._built) this._build();
    this._applyColors(this._card);
    this._card.style.setProperty("--ems-name-size", `${Number(this._config.name_font_size) || 11}px`);
    this._card.style.setProperty("--ems-value-size", `${Number(this._config.value_font_size) || 26}px`);

    for (const { device, value } of this._deviceEls) {
      value.textContent = this._formatValue(device.entity, Number(device.decimals) || 0);
      value.style.color =
        device.switch_entity && !this._isOn(device.switch_entity) ? "var(--ems-off)" : "var(--ems-text)";
    }
  }
}

const APPEARANCE_SCHEMA = [
  { name: "background_color", selector: { color_rgb: {} } },
  { name: "accent_color", selector: { color_rgb: {} } },
  { name: "text_color", selector: { color_rgb: {} } },
  { name: "off_color", selector: { color_rgb: {} } },
  { name: "tile_radius", selector: { number: { min: 0, max: 40, step: 1, mode: "slider" } } },
  { name: "columns", selector: { number: { min: 1, max: 6, step: 1, mode: "box" } } },
  {
    name: "thousands_separator",
    selector: { select: { options: ["auto", ".", ",", " ", "geen"], mode: "dropdown" } },
  },
];

const LABELS = {
  title: "Titel",
  weather_entity: "Weer (weather-entiteit)",
  flow_entity: "Energiestroom (sensor, + = import)",
  flow_name: "Naam energiestroom",
  flow_max: "Schaal energiestroom (W)",
  flow_left_icon: "Icoon links",
  flow_right_icon: "Icoon rechts",
  background_color: "Achtergrondkleur",
  accent_color: "Accentkleur",
  text_color: "Tekstkleur",
  off_color: "Kleur wanneer uitgeschakeld",
  tile_radius: "Afronding hoeken (px)",
  columns: "Aantal kolommen",
  entity: "Vermogenssensor",
  switch_entity: "Schakelaar (optioneel)",
  name: "Naam",
  secondary_entity: "Extra waarde (optioneel)",
  decimals: "Decimalen",
  production_entity: "Zonneproductie (sensor)",
  self_consumption_entity: "Huidig verbruik (sensor)",
  grid_power_entity: "Net import/export (sensor)",
  invert_grid_power: "Netsensor omdraaien",
  ev_entity: "Laadpaal (sensor)",
  forecast_entity: "Verwachte productie nu (sensor)",
  solar_name: "Naam zonnebalk",
  inverter_size: "Omvormervermogen (kW)",
  power_unit: "Eenheid (W of kW)",
  show_solar_legend: "Toon legenda met waarden",
  solar_color: "Kleur zon",
  export_color: "Kleur export",
  import_color: "Kleur import",
  ev_color: "Kleur laadpaal",
  consumer_1_entity: "Verbruiker 1 (sensor)",
  consumer_1_name: "Naam verbruiker 1",
  consumer_1_color: "Kleur verbruiker 1",
  consumer_2_entity: "Verbruiker 2 (sensor)",
  consumer_2_name: "Naam verbruiker 2",
  consumer_2_color: "Kleur verbruiker 2",
  production_history_entity: "Opbrengst vandaag (kWh)",
  import_entity: "Import (aparte sensor)",
  export_entity: "Export (aparte sensor)",
  ev_name: "Naam laadpaal",
  show_bar_values: "Toon waarden in de balk",
  show_grid_icon_always: "Net-icoon altijd tonen",
  battery_soc_entity: "Batterijlading (%)",
  battery_power_entity: "Batterijvermogen (+ = laden)",
  invert_battery_power: "Batterijsensor omdraaien",
  battery_charge_entity: "Laadvermogen batterij",
  battery_discharge_entity: "Ontlaadvermogen batterij",
  battery_capacity: "Batterijcapaciteit (kWh)",
  show_battery_indicator: "Toon batterijbalk",
  show_battery_flow: "Toon batterijanimatie",
  battery_color: "Kleur batterij",
  show_stats: "Toon tegels",
  show_stats_detail: "Toon dagtotalen op tegels",
  show_net_indicator: "Toon netto-stip",
  consumption_history_entity: "Verbruik vandaag (kWh)",
  import_history_entity: "Import vandaag (kWh)",
  export_history_entity: "Export vandaag (kWh)",
  ev_history_entity: "Laadpaal vandaag (kWh)",
  car_charger_load: "Capaciteit laadpaal (kW)",
  disable_animation: "Animatie uitzetten",
  animation_speed: "Snelheid animatie (s)",
  thousands_separator: "Scheidingsteken duizendtallen",
  name_font_size: "Lettergrootte naam (px)",
  value_font_size: "Lettergrootte waarde (px)",
  auto_scale: "Schaal automatisch vergroten",
  flow_auto_scale: "Schaal energiestroom automatisch vergroten",
};

/** Editor met een herhaalbare lijst van tegels/apparaten. */
class EmsRepeaterEditor extends HTMLElement {
  constructor(options) {
    super();
    this._config = {};
    this._listKey = options.listKey;
    this._itemSchema = options.itemSchema;
    this._baseSchema = options.baseSchema;
    this._cardType = options.cardType;
    this._itemForms = [];
    this._itemCount = -1;
    this._built = false;
  }

  setConfig(config) {
    this._config = { ...STYLE_DEFAULTS, ...SOLAR_DEFAULTS, ...config };
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  _emit(config) {
    this._config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
    this._update();
  }

  _items() {
    return Array.isArray(this._config[this._listKey]) ? this._config[this._listKey] : [];
  }

  _label(schema) {
    return LABELS[schema.name] || schema.name;
  }

  /** Bouwt de DOM alleen opnieuw als het aantal rijen wijzigt, anders verliezen velden hun focus. */
  _update() {
    if (!this._hass) return;
    const items = this._items();
    if (!this._built || items.length !== this._itemCount) {
      this._render();
      return;
    }
    this._baseForm.hass = this._hass;
    this._baseForm.data = this._config;
    this._itemForms.forEach((entry, index) => {
      entry.form.hass = this._hass;
      entry.form.data = items[index];
      entry.label.textContent = items[index].name || items[index].entity || `#${index + 1}`;
    });
  }

  _render() {
    if (!this._hass) return;
    this.innerHTML = "";
    this._itemForms = [];

    const base = document.createElement("ha-form");
    base.hass = this._hass;
    base.schema = this._baseSchema;
    base.data = this._config;
    base.computeLabel = (schema) => this._label(schema);
    base.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      this._emit({ type: this._cardType, ...this._config, ...ev.detail.value });
    });
    this._baseForm = base;
    this.appendChild(base);

    const items = this._items();
    items.forEach((item, index) => {
      const wrapper = document.createElement("div");
      wrapper.style.cssText =
        "border:1px solid var(--divider-color);border-radius:12px;padding:8px 12px;margin:12px 0;";

      const header = document.createElement("div");
      header.style.cssText = "display:flex;align-items:center;justify-content:space-between;";
      const label = document.createElement("b");
      label.textContent = item.name || item.entity || `#${index + 1}`;
      const buttons = document.createElement("div");

      const up = document.createElement("ha-icon-button");
      up.innerHTML = '<ha-icon icon="mdi:arrow-up"></ha-icon>';
      up.disabled = index === 0;
      up.addEventListener("click", () => {
        const list = [...this._items()];
        [list[index - 1], list[index]] = [list[index], list[index - 1]];
        this._emit({ ...this._config, [this._listKey]: list });
        this._render();
      });

      const remove = document.createElement("ha-icon-button");
      remove.innerHTML = '<ha-icon icon="mdi:delete"></ha-icon>';
      remove.addEventListener("click", () => {
        const list = this._items().filter((_, position) => position !== index);
        this._emit({ ...this._config, [this._listKey]: list });
      });

      buttons.append(up, remove);
      header.append(label, buttons);

      const form = document.createElement("ha-form");
      form.hass = this._hass;
      form.schema = this._itemSchema;
      form.data = item;
      form.computeLabel = (schema) => this._label(schema);
      form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const list = this._items().map((entry, position) =>
          position === index ? { ...entry, ...ev.detail.value } : entry
        );
        this._emit({ ...this._config, [this._listKey]: list });
      });

      wrapper.append(header, form);
      this.appendChild(wrapper);
      this._itemForms.push({ form, label });
    });

    this._itemCount = items.length;
    this._built = true;

    const add = document.createElement("mwc-button");
    add.setAttribute("raised", "");
    add.textContent =
      (this._hass?.language || "en").startsWith("nl") ? "Tegel toevoegen" : "Add tile";
    add.addEventListener("click", () => {
      this._emit({ ...this._config, [this._listKey]: [...items, {}] });
    });
    this.appendChild(add);
  }
}

class EmsOverviewCardEditor extends EmsRepeaterEditor {
  constructor() {
    super({
      cardType: "custom:ems-overview-card",
      listKey: "tiles",
      itemSchema: [
        { name: "entity", selector: { entity: { domain: ["sensor", "number", "input_number"] } } },
        { name: "name", selector: { text: {} } },
        { name: "secondary_entity", selector: { entity: { domain: ["sensor"] } } },
        { name: "switch_entity", selector: { entity: { domain: ["switch", "light", "input_boolean", "fan"] } } },
        { name: "decimals", selector: { number: { min: 0, max: 3, step: 1, mode: "box" } } },
      ],
      baseSchema: [
        { name: "title", selector: { text: {} } },
        { name: "weather_entity", selector: { entity: { domain: ["weather"] } } },
        {
          name: "",
          type: "expandable",
          title: "Zonne-energie",
          schema: [
            { name: "production_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "self_consumption_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "grid_power_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "invert_grid_power", selector: { boolean: {} } },
            { name: "import_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "export_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "ev_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "ev_name", selector: { text: {} } },
            { name: "consumer_1_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "consumer_1_name", selector: { text: {} } },
            { name: "consumer_2_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "consumer_2_name", selector: { text: {} } },
            { name: "forecast_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "production_history_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "solar_name", selector: { text: {} } },
            { name: "inverter_size", selector: { number: { min: 0.5, max: 50, step: 0.5, mode: "box" } } },
            { name: "auto_scale", selector: { boolean: {} } },
            { name: "power_unit", selector: { select: { options: ["W", "kW"], mode: "dropdown" } } },
            { name: "decimals", selector: { number: { min: 0, max: 3, step: 1, mode: "box" } } },
            { name: "show_solar_legend", selector: { boolean: {} } },
            { name: "show_bar_values", selector: { boolean: {} } },
            { name: "show_grid_icon_always", selector: { boolean: {} } },
            { name: "solar_color", selector: { color_rgb: {} } },
            { name: "export_color", selector: { color_rgb: {} } },
            { name: "import_color", selector: { color_rgb: {} } },
            { name: "ev_color", selector: { color_rgb: {} } },
            { name: "consumer_1_color", selector: { color_rgb: {} } },
            { name: "consumer_2_color", selector: { color_rgb: {} } },
          ],
        },
        {
          name: "",
          type: "expandable",
          title: "Energiestroom",
          schema: [
            { name: "flow_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "flow_name", selector: { text: {} } },
            { name: "flow_max", selector: { number: { min: 100, max: 25000, step: 100, mode: "box" } } },
            { name: "flow_auto_scale", selector: { boolean: {} } },
            { name: "flow_left_icon", selector: { icon: {} } },
            { name: "flow_right_icon", selector: { icon: {} } },
          ],
        },
        {
          name: "",
          type: "expandable",
          title: "Batterij",
          schema: [
            { name: "battery_soc_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "battery_power_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "invert_battery_power", selector: { boolean: {} } },
            { name: "battery_charge_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "battery_discharge_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "battery_capacity", selector: { number: { min: 1, max: 200, step: 1, mode: "box" } } },
            { name: "show_battery_indicator", selector: { boolean: {} } },
            { name: "show_battery_flow", selector: { boolean: {} } },
            { name: "battery_color", selector: { color_rgb: {} } },
          ],
        },
        {
          name: "",
          type: "expandable",
          title: "Dagtotalen en tegels",
          schema: [
            { name: "show_stats", selector: { boolean: {} } },
            { name: "show_stats_detail", selector: { boolean: {} } },
            { name: "show_net_indicator", selector: { boolean: {} } },
            { name: "consumption_history_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "import_history_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "export_history_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "ev_history_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "car_charger_load", selector: { number: { min: 0, max: 50, step: 0.5, mode: "box" } } },
            { name: "disable_animation", selector: { boolean: {} } },
            { name: "animation_speed", selector: { number: { min: 0.5, max: 10, step: 0.5, mode: "box" } } },
          ],
        },
        { name: "", type: "expandable", title: "Weergave", schema: APPEARANCE_SCHEMA },
      ],
    });
  }
}

class EmsDevicesCardEditor extends EmsRepeaterEditor {
  constructor() {
    super({
      cardType: "custom:ems-devices-card",
      listKey: "devices",
      itemSchema: [
        { name: "entity", selector: { entity: { domain: ["sensor"] } } },
        { name: "name", selector: { text: {} } },
        { name: "switch_entity", selector: { entity: { domain: ["switch", "light", "input_boolean", "fan"] } } },
        { name: "decimals", selector: { number: { min: 0, max: 3, step: 1, mode: "box" } } },
      ],
      baseSchema: [
        { name: "title", selector: { text: {} } },
        { name: "name_font_size", selector: { number: { min: 8, max: 24, step: 1, mode: "box" } } },
        { name: "value_font_size", selector: { number: { min: 12, max: 48, step: 1, mode: "box" } } },
        { name: "", type: "expandable", title: "Weergave", schema: APPEARANCE_SCHEMA },
      ],
    });
  }
}

class EmsConsumersCard extends EmsBaseCard {
  static getConfigElement() {
    return document.createElement("ems-consumers-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:ems-consumers-card",
      columns: 3,
      devices: [],
      background_color: "#1d3b33",
      tile_color: "rgba(255,255,255,.07)",
      text_color: "#ffffff",
      off_color: "#ff453a",
      tile_radius: 16,
      name_font_size: 11,
      value_font_size: 26,
    };
  }

  constructor() {
    super();
    this._built = false;
  }

  getCardSize() {
    return 1 + Math.ceil((this._config.devices?.length || 0) / (Number(this._config.columns) || 3));
  }

  _build() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>
      :host { display: block; }
      ha-card { background: var(--ems-card-bg); color: var(--ems-text); border: none; box-shadow: none;
        border-radius: var(--ha-card-border-radius, 18px); padding: 16px; box-sizing: border-box; }
      .grid { display: grid; grid-template-columns: repeat(var(--ems-columns, 3), minmax(0, 1fr)); gap: 8px; }
      .tile { background: var(--ems-bg); border-radius: var(--ems-radius); min-height: 80px; padding: 8px; box-sizing: border-box;
        border: 1px solid rgba(255,255,255,.025);
        display: grid; grid-template-areas: "name" "value"; grid-template-rows: 18px 1fr; justify-items: center; align-items: center;
        cursor: pointer; transition: filter .15s ease; }
      .tile:hover { filter: brightness(1.08); }
      .name { grid-area: name; color: rgba(255,255,255,.65); font-size: var(--ems-name-size, 11px); font-weight: 400; text-align: center;
        line-height: 18px; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .value { grid-area: value; color: var(--ems-text); font-size: var(--ems-value-size, 26px); font-weight: 700; line-height: 1;
        text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; align-self: center; }
      .empty { min-height: 80px; border-radius: var(--ems-radius); background: var(--ems-bg); color: var(--ems-text); opacity: .7; display: flex; align-items: center; justify-content: center; padding: 12px; text-align: center; }
    </style><ha-card><div class="grid"></div></ha-card>`;

    this._card = root.querySelector("ha-card");
    this._grid = root.querySelector(".grid");
    this._tileEls = [];
    const devices = Array.isArray(this._config.devices)
      ? this._config.devices.filter((device) => device?.entity)
      : [];
    this._grid.style.setProperty("--ems-columns", String(Number(this._config.columns) || 3));

    if (!devices.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = this._t("empty");
      this._grid.appendChild(empty);
    }

    for (const device of devices) {
      const tile = document.createElement("div");
      tile.className = "tile";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = device.name || this._friendlyName(device.entity);
      const value = document.createElement("div");
      value.className = "value";
      tile.append(name, value);
      tile.addEventListener("click", () => this._tap(device));
      this._grid.appendChild(tile);
      this._tileEls.push({ device, value });
    }
    this._built = true;
  }

  _render() {
    if (!this._hass) return;
    if (!this._built) this._build();
    this._applyColors(this._card);
    this._card.style.setProperty("--ems-card-bg", toCssColor(this._config.background_color, "#1d3b33"));
    this._card.style.setProperty("--ems-bg", toCssColor(this._config.tile_color, "rgba(255,255,255,.07)"));
    this._card.style.setProperty("--ems-radius", `${Number(this._config.tile_radius) || 16}px`);
    this._card.style.setProperty("--ems-name-size", `${Number(this._config.name_font_size) || 11}px`);
    this._card.style.setProperty("--ems-value-size", `${Number(this._config.value_font_size) || 26}px`);
    for (const { device, value } of this._tileEls) {
      value.textContent = this._formatValue(device.entity, Number(device.decimals) || 0);
      value.style.color = device.switch_entity && !this._isOn(device.switch_entity)
        ? "var(--ems-off)"
        : "var(--ems-text)";
    }
  }
}

class EmsConsumersCardEditor extends EmsRepeaterEditor {
  constructor() {
    super({
      cardType: "custom:ems-consumers-card",
      listKey: "devices",
      itemSchema: [
        { name: "entity", selector: { entity: { domain: ["sensor"] } } },
        { name: "name", selector: { text: {} } },
        { name: "switch_entity", selector: { entity: { domain: ["switch", "light", "input_boolean", "fan"] } } },
        { name: "decimals", selector: { number: { min: 0, max: 3, step: 1, mode: "box" } } },
      ],
      baseSchema: [
        { name: "columns", selector: { number: { min: 1, max: 6, step: 1, mode: "box" } } },
        { name: "name_font_size", selector: { number: { min: 8, max: 24, step: 1, mode: "box" } } },
        { name: "value_font_size", selector: { number: { min: 12, max: 48, step: 1, mode: "box" } } },
        { name: "", type: "expandable", title: "Weergave", schema: APPEARANCE_SCHEMA },
      ],
    });
  }
}

class EmsEnergyInsightsCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("ems-energy-insights-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:ems-energy-insights-card",
      title: "Energie-inzichten",
      ...STYLE_DEFAULTS,
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._built = false;
    this._data = { today: {}, week: {} };
    this._lastFetch = 0;
  }

  setConfig(config) {
    this._config = { ...STYLE_DEFAULTS, ...config };
    this._built = false;
    this.shadowRoot.innerHTML = "";
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
    this._fetchData();
  }

  getCardSize() {
    return 9;
  }

  _lang() {
    return (this._hass?.locale?.language || this._hass?.language || "nl").slice(0, 2);
  }

  _text(key) {
    const labels = {
      nl: { title: "Energie-inzichten", production: "Productie", consumption: "Verbruik", export: "Teruglevering", today: "Vandaag", week: "Afgelopen week", noData: "Nog geen gegevens" },
      en: { title: "Energy insights", production: "Production", consumption: "Consumption", export: "Export", today: "Today", week: "Last week", noData: "No data yet" },
    };
    return (labels[this._lang()] || labels.nl)[key];
  }

  _format(value) {
    return Number(value || 0).toLocaleString(this._lang(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async _fetchData() {
    const consumptionIds = [
      this._config.consumption_high_entity,
      this._config.consumption_low_entity,
      this._config.consumption_entity,
    ].filter(Boolean);
    const productionIds = [
      this._config.production_high_entity,
      this._config.production_low_entity,
      this._config.production_entity,
    ].filter(Boolean);
    const ids = [...new Set([...consumptionIds, ...productionIds, this._config.export_entity].filter(Boolean))];
    if (!this._hass || !ids.length || Date.now() - this._lastFetch < 300000) return;
    this._lastFetch = Date.now();
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const week = new Date(today);
    week.setDate(week.getDate() - 6);
    try {
      const [todayResult, weekResult] = await Promise.all([
        this._hass.callWS({ type: "recorder/statistics_during_period", start_time: today.toISOString(), end_time: now.toISOString(), statistic_ids: ids, period: "hour", types: ["change"] }),
        this._hass.callWS({ type: "recorder/statistics_during_period", start_time: week.toISOString(), end_time: now.toISOString(), statistic_ids: ids, period: "day", types: ["change"] }),
      ]);
      this._data.today = this._mapSeries(todayResult, ids, "hour");
      this._data.week = this._mapSeries(weekResult, ids, "day");
      this._data.today.consumption = this._combineSeries(this._data.today, consumptionIds);
      this._data.week.consumption = this._combineSeries(this._data.week, consumptionIds);
      this._data.today.production = this._combineSeries(this._data.today, productionIds);
      this._data.week.production = this._combineSeries(this._data.week, productionIds);
    } catch (error) {
      this._data = { today: {}, week: {} };
    }
    this._drawCharts();
  }

  _mapSeries(result, ids, period) {
    const output = {};
    for (const id of ids) {
      output[id] = (result?.[id] || []).map((point) => ({
        label: period === "hour"
          ? `${String(new Date(point.start).getHours()).padStart(2, "0")}:00`
          : new Date(point.start).toLocaleDateString(this._lang(), { weekday: "short" }),
        value: Math.max(0, Number(point.change) || 0),
      }));
    }
    return output;
  }

  _combineSeries(series, ids) {
    const combined = new Map();
    for (const id of ids) {
      for (const point of series[id] || []) {
        combined.set(point.label, (combined.get(point.label) || 0) + point.value);
      }
    }
    return [...combined.entries()].map(([label, value]) => ({ label, value }));
  }

  _build() {
    this.shadowRoot.innerHTML = `<style>
      :host { display: block; }
      ha-card { background: var(--ems-bg); color: var(--ems-text); border: none; border-radius: var(--ha-card-border-radius, 18px); padding: 18px; overflow: hidden; }
      .header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
      .header ha-icon { --mdc-icon-size: 22px; color: var(--ems-accent); }
      h1 { margin: 0; font-size: 1.15rem; font-weight: 600; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .panel { background: var(--ems-tile); border-radius: 12px; padding: 10px; min-width: 0; cursor: pointer; }
      .panel:hover { filter: brightness(1.08); }
      .head { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
      .label { font-size: .76rem; opacity: .72; }
      .total { font-size: .9rem; font-weight: 700; white-space: nowrap; }
      .bars { height: 112px; display: flex; align-items: flex-end; gap: 3px; margin-top: 10px; }
      .bar { flex: 1; min-width: 0; min-height: 2px; border-radius: 3px 3px 0 0; background: var(--ems-accent); opacity: .86; position: relative; cursor: pointer; }
      .bar:hover, .bar:focus-visible { opacity: 1; outline: 2px solid var(--ems-accent); outline-offset: 2px; }
      .bar-value { position: absolute; left: 50%; bottom: calc(100% + 5px); transform: translateX(-50%); display: none; z-index: 2;
        background: var(--ems-bg); color: var(--ems-text); border-radius: 5px; padding: 3px 5px; font-size: .62rem; line-height: 1; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
      .bar:hover .bar-value, .bar:focus-visible .bar-value { display: block; }
      .bar[data-empty="true"] { background: rgba(255,255,255,.14); }
      .axis { display: flex; justify-content: space-between; font-size: .6rem; opacity: .48; margin-top: 5px; }
      .empty { height: 112px; display: flex; align-items: center; justify-content: center; text-align: center; font-size: .76rem; opacity: .55; }
      @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
    </style><ha-card><div class="header"><ha-icon icon="mdi:chart-line"></ha-icon><h1></h1></div><div class="grid"></div></ha-card>`;
    this._card = this.shadowRoot.querySelector("ha-card");
    this._title = this.shadowRoot.querySelector("h1");
    this._grid = this.shadowRoot.querySelector(".grid");
    this._panels = {};
    for (const [kind, entity] of [
      ["production", this._config.production_high_entity || this._config.production_low_entity || this._config.production_entity],
      ["consumption", this._config.consumption_high_entity || this._config.consumption_low_entity || this._config.consumption_entity],
      ["export", this._config.export_entity],
    ]) {
      if (!entity) continue;
      for (const range of ["today", "week"]) {
        const panel = document.createElement("section");
        panel.className = "panel";
        panel.innerHTML = `<div class="head"><span class="label"></span><b class="total"></b></div><div class="bars"></div><div class="axis"></div>`;
        panel.querySelector(".label").textContent = `${this._text(kind)} · ${this._text(range)}`;
        this._grid.appendChild(panel);
        panel.addEventListener("click", () => this._fireMoreInfo(entity));
        this._panels[`${kind}_${range}`] = { bars: panel.querySelector(".bars"), total: panel.querySelector(".total"), axis: panel.querySelector(".axis") };
      }
    }
    this._built = true;
  }

  _draw(series, panel) {
    if (!panel) return;
    panel.bars.innerHTML = "";
    if (!series?.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = this._text("noData");
      panel.bars.appendChild(empty);
      panel.total.textContent = "0,00 kWh";
      panel.axis.textContent = "";
      return;
    }
    const max = Math.max(...series.map((item) => item.value), 0.001);
    const total = series.reduce((sum, item) => sum + item.value, 0);
    for (const item of series) {
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.tabIndex = 0;
      bar.style.height = `${item.value ? Math.max(4, (item.value / max) * 100) : 2}%`;
      bar.dataset.empty = String(item.value <= 0);
      bar.title = `${item.label}: ${this._format(item.value)} kWh`;
      const value = document.createElement("span");
      value.className = "bar-value";
      value.textContent = `${this._format(item.value)} kWh`;
      bar.appendChild(value);
      panel.bars.appendChild(bar);
    }
    panel.total.textContent = `${this._format(total)} kWh`;
    panel.axis.innerHTML = "";
    [series[0], series[Math.floor(series.length / 2)], series[series.length - 1]].forEach((item) => {
      const label = document.createElement("span");
      label.textContent = item.label;
      panel.axis.appendChild(label);
    });
  }

  _drawCharts() {
    if (!this._built) return;
    for (const kind of ["production", "consumption", "export"]) {
      for (const range of ["today", "week"]) {
        const entity = ["consumption", "production"].includes(kind)
          ? kind
          : this._config[`${kind}_entity`];
        this._draw(this._data[range]?.[entity], this._panels[`${kind}_${range}`]);
      }
    }
  }

  _render() {
    if (!this._hass) return;
    if (!this._built) this._build();
    this._card.style.setProperty("--ems-bg", toCssColor(this._config.background_color, STYLE_DEFAULTS.background_color));
    this._card.style.setProperty("--ems-accent", toCssColor(this._config.accent_color, STYLE_DEFAULTS.accent_color));
    this._card.style.setProperty("--ems-text", toCssColor(this._config.text_color, STYLE_DEFAULTS.text_color));
    this._card.style.setProperty("--ems-tile", toCssColor(this._config.tile_color, "rgba(255,255,255,.07)"));
    this._title.textContent = this._config.title || this._text("title");
    this._drawCharts();
  }
}

class EmsEnergyInsightsCardEditor extends HTMLElement {
  setConfig(config) { this._config = { ...STYLE_DEFAULTS, ...config }; this._render(); }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; }
  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.schema = [
        { name: "title", selector: { text: {} } },
        { name: "production_high_entity", selector: { entity: { domain: ["sensor"] } } },
        { name: "production_low_entity", selector: { entity: { domain: ["sensor"] } } },
        { name: "production_entity", selector: { entity: { domain: ["sensor"] } } },
        { name: "consumption_high_entity", selector: { entity: { domain: ["sensor"] } } },
        { name: "consumption_low_entity", selector: { entity: { domain: ["sensor"] } } },
        { name: "consumption_entity", selector: { entity: { domain: ["sensor"] } } },
        { name: "export_entity", selector: { entity: { domain: ["sensor"] } } },
        { name: "background_color", selector: { color_rgb: {} } },
        { name: "accent_color", selector: { color_rgb: {} } },
        { name: "text_color", selector: { color_rgb: {} } },
        { name: "tile_color", selector: { color_rgb: {} } },
      ];
      const labels = { title: "Titel", production_high_entity: "Productie hoogtarief (kWh)", production_low_entity: "Productie laagtarief (kWh)", production_entity: "Productie gecombineerd (bestaand)", consumption_high_entity: "Verbruik hoogtarief (kWh)", consumption_low_entity: "Verbruik laagtarief (kWh)", consumption_entity: "Verbruik gecombineerd (bestaand)", export_entity: "Teruglevering (kWh)", background_color: "Achtergrondkleur", accent_color: "Grafiekkleur", text_color: "Tekstkleur", tile_color: "Tegelkleur" };
      this._form.computeLabel = (schema) => labels[schema.name] || schema.name;
      this._form.addEventListener("value-changed", (event) => this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { type: "custom:ems-energy-insights-card", ...event.detail.value } }, bubbles: true, composed: true })));
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
  }
}

class EmsPhasesCard extends HTMLElement {
  static getConfigElement() { return document.createElement("ems-phases-card-editor"); }
  static getStubConfig() {
    return { type: "custom:ems-phases-card", title: "Fasen", max_current: 25, ...STYLE_DEFAULTS };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._built = false;
  }

  setConfig(config) {
    this._config = { ...STYLE_DEFAULTS, ...config };
    this._built = false;
    this.shadowRoot.innerHTML = "";
    if (this._hass) this._render();
  }

  set hass(hass) { this._hass = hass; this._render(); }
  getCardSize() { return 8; }

  _state(entity) { return entity && this._hass ? this._hass.states[entity] : undefined; }
  _value(entity) {
    const value = Number(this._state(entity)?.state);
    return Number.isFinite(value) ? value : 0;
  }
  _format(value, unit) {
    return `${value.toLocaleString(this._hass?.locale?.language || "nl", { maximumFractionDigits: 2 })} ${unit}`;
  }

  _groups() {
    try {
      const groups = typeof this._config.groups === "string" ? JSON.parse(this._config.groups) : this._config.groups;
      return Array.isArray(groups) ? groups.filter((group) => group?.name || group?.description) : [];
    } catch (error) {
      return [];
    }
  }

  _build() {
    this.shadowRoot.innerHTML = `<style>
      :host { display:block; }
      ha-card { background:var(--ems-phase-bg); color:var(--ems-phase-text); border:0; border-radius:var(--ha-card-border-radius,18px); padding:16px; overflow:hidden; }
      .header { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
      .header ha-icon { --mdc-icon-size:22px; color:var(--ems-phase-accent); }
      h1 { margin:0; font-size:1.15rem; font-weight:600; }
      .phases { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
      .phase { background:var(--ems-phase-tile); border-radius:12px; padding:9px 8px; text-align:center; min-width:0; }
      .phase-name { font-size:.7rem; opacity:.68; }
      .power { font-size:1.35rem; font-weight:700; margin:3px 0 7px; white-space:nowrap; }
      .metric { display:flex; justify-content:space-between; gap:4px; font-size:.68rem; opacity:.76; }
      .track { height:4px; border-radius:3px; background:rgba(255,255,255,.12); margin-top:7px; overflow:hidden; }
      .fill { height:100%; width:0; background:var(--ems-phase-accent); transition:width .3s ease; }
      .fill.high { background:#ff453a; }
      .groups { margin-top:12px; border-radius:12px; overflow:hidden; background:var(--ems-phase-tile); }
      .groups-head, .group { display:grid; grid-template-columns:1fr 56px; gap:8px; padding:6px 9px; font-size:.68rem; }
      .groups-head { opacity:.55; border-bottom:1px solid rgba(255,255,255,.12); }
      .group { border-bottom:1px solid rgba(255,255,255,.06); }
      .group:last-child { border-bottom:0; }
      .group > span:first-child { min-width:0; overflow-wrap:anywhere; }
      .group-phase { text-align:right; color:var(--ems-phase-accent); font-weight:600; }
      .empty { opacity:.6; text-align:center; padding:12px; font-size:.76rem; }
      @media (max-width:560px) { .power { font-size:1.05rem; } .groups-head,.group { grid-template-columns:1fr 42px; } }
    </style><ha-card><div class="header"><ha-icon icon="mdi:transmission-tower"></ha-icon><h1></h1></div><div class="phases"></div><div class="groups"></div></ha-card>`;
    this._card = this.shadowRoot.querySelector("ha-card");
    this._title = this.shadowRoot.querySelector("h1");
    this._phases = this.shadowRoot.querySelector(".phases");
    this._groupsEl = this.shadowRoot.querySelector(".groups");
    this._phaseEls = [];
    for (let index = 1; index <= 3; index += 1) {
      const phase = document.createElement("section");
      phase.className = "phase";
      phase.innerHTML = `<div class="phase-name">Fase ${index}</div><div class="power"></div><div class="metric"><span class="current"></span><span class="voltage"></span></div><div class="track"><div class="fill"></div></div>`;
      this._phases.appendChild(phase);
      this._phaseEls.push({ phase, power: phase.querySelector(".power"), current: phase.querySelector(".current"), voltage: phase.querySelector(".voltage"), fill: phase.querySelector(".fill") });
    }
    this._built = true;
  }

  _render() {
    if (!this._hass) return;
    if (!this._built) this._build();
    const cfg = this._config;
    this._card.style.setProperty("--ems-phase-bg", toCssColor(cfg.background_color, "#1d3b33"));
    this._card.style.setProperty("--ems-phase-tile", toCssColor(cfg.tile_color, "rgba(255,255,255,.07)"));
    this._card.style.setProperty("--ems-phase-text", toCssColor(cfg.text_color, "#ffffff"));
    this._card.style.setProperty("--ems-phase-accent", toCssColor(cfg.accent_color, "#e8c547"));
    this._title.textContent = cfg.title || "Fasen";
    const max = Number(cfg.max_current) || 25;
    this._phaseEls.forEach((elements, index) => {
      const phase = index + 1;
      const power = this._value(cfg[`phase_${phase}_power_entity`]);
      const current = this._value(cfg[`phase_${phase}_current_entity`]);
      const voltage = this._value(cfg[`phase_${phase}_voltage_entity`]);
      elements.power.textContent = this._format(power, "W");
      elements.current.textContent = this._format(current, "A");
      elements.voltage.textContent = this._format(voltage, "V");
      elements.fill.style.width = `${Math.min(100, current / max * 100)}%`;
      elements.fill.classList.toggle("high", current >= max * .8);
    });
    const groups = this._groups();
    this._groupsEl.innerHTML = groups.length
      ? `<div class="groups-head"><span>Groep</span><span>Fase</span></div>${groups.map((group) => {
        const phase = group.phase ?? group.fase ?? group.phase_number ?? "-";
        return `<div class="group"><span>${group.name || ""}</span><span class="group-phase">Fase ${phase}</span></div>`;
      }).join("")}`
      : `<div class="empty">Voeg groepen toe via de kaart-editor.</div>`;
  }
}

class EmsPhasesCardEditor extends HTMLElement {
  setConfig(config) { this._config = { ...STYLE_DEFAULTS, ...config }; this._render(); }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; }
  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      const schema = [{ name: "title", selector: { text: {} } }, { name: "max_current", selector: { number: { min: 6, max: 63, step: 1, mode: "box" } } }];
      for (let phase = 1; phase <= 3; phase += 1) {
        schema.push({ name: `phase_${phase}_power_entity`, selector: { entity: { domain: ["sensor"] } } });
        schema.push({ name: `phase_${phase}_current_entity`, selector: { entity: { domain: ["sensor"] } } });
        schema.push({ name: `phase_${phase}_voltage_entity`, selector: { entity: { domain: ["sensor"] } } });
      }
      schema.push({ name: "groups", selector: { text: { multiline: true } } }, { name: "background_color", selector: { color_rgb: {} } }, { name: "tile_color", selector: { color_rgb: {} } }, { name: "accent_color", selector: { color_rgb: {} } }, { name: "text_color", selector: { color_rgb: {} } });
      this._form.schema = schema;
      const labels = { title: "Titel", max_current: "Maximale stroom per fase (A)", groups: "Groepen als JSON: [{name,description,phase}]", background_color: "Achtergrondkleur", tile_color: "Tegelkleur", accent_color: "Accentkleur", text_color: "Tekstkleur" };
      for (let phase = 1; phase <= 3; phase += 1) { labels[`phase_${phase}_power_entity`] = `Fase ${phase} vermogen`; labels[`phase_${phase}_current_entity`] = `Fase ${phase} stroom`; labels[`phase_${phase}_voltage_entity`] = `Fase ${phase} voltage`; }
      this._form.computeLabel = (field) => labels[field.name] || field.name;
      this._form.addEventListener("value-changed", (event) => this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { type: "custom:ems-phases-card", ...event.detail.value } }, bubbles: true, composed: true })));
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
  }
}

class EmsSurplusCard extends HTMLElement {
  static getConfigElement() { return document.createElement("ems-surplus-card-editor"); }
  static getStubConfig() {
    return { type: "custom:ems-surplus-card", title: "Zonne-overschot", surplus_entity: "", threshold: 500, ...STYLE_DEFAULTS };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._built = false;
  }

  setConfig(config) {
    this._config = { ...STYLE_DEFAULTS, ...config };
    this._built = false;
    this.shadowRoot.innerHTML = "";
    if (this._hass) this._render();
  }

  set hass(hass) { this._hass = hass; this._render(); }
  getCardSize() { return 4; }

  _state(entity) { return entity && this._hass ? this._hass.states[entity] : undefined; }
  _power(entity) {
    const state = this._state(entity);
    const value = Number(state?.state);
    if (!Number.isFinite(value)) return 0;
    return /kw/i.test(state?.attributes?.unit_of_measurement || "") ? value * 1000 : value;
  }
  _surplus(entity) {
    const value = this._power(entity);
    return this._config.invert_surplus_entity ? Math.max(0, -value) : Math.max(0, value);
  }
  _format(value) {
    return `${value.toLocaleString(this._hass?.locale?.language || "nl", { maximumFractionDigits: 0 })} W`;
  }
  _moreInfo(entity) {
    if (!entity) return;
    const event = new Event("hass-more-info", { bubbles: true, composed: true });
    event.detail = { entityId: entity };
    this.dispatchEvent(event);
  }
  _suggestions() {
    return [1, 2, 3].map((index) => ({
      label: this._config[`suggestion_${index}_name`],
      icon: this._config[`suggestion_${index}_icon`] || "mdi:lightbulb-on-outline",
      threshold: Number(this._config[`suggestion_${index}_threshold`]),
      offThreshold: Number(this._config[`suggestion_${index}_off_threshold`]),
      entity: this._config[`suggestion_${index}_entity`],
      actionEntity: this._config[`suggestion_${index}_action_entity`],
      statusEntity: this._config[`suggestion_${index}_status_entity`],
    })).filter((item) => item.label && Number.isFinite(item.threshold));
  }

  _build() {
    this.shadowRoot.innerHTML = `<style>
      :host { display:block; }
      ha-card { background:var(--ems-surplus-bg); color:var(--ems-surplus-text); border:0; border-radius:var(--ha-card-border-radius,18px); padding:16px; overflow:hidden; }
      .header { display:flex; align-items:center; gap:10px; }
      .header ha-icon { --mdc-icon-size:22px; color:var(--ems-surplus-accent); }
      h1 { margin:0; font-size:1.15rem; font-weight:600; }
      .reading { display:flex; align-items:baseline; justify-content:space-between; margin-top:14px; }
      .reading-label { font-size:.75rem; opacity:.68; }
      .reading-value { font-size:1.55rem; font-weight:700; }
      .track { height:7px; margin-top:8px; border-radius:5px; background:rgba(255,255,255,.12); overflow:hidden; }
      .fill { height:100%; width:0; background:var(--ems-surplus-accent); transition:width .35s ease; }
      .hint { font-size:.73rem; opacity:.62; margin-top:6px; }
      .suggestions { display:grid; gap:8px; margin-top:14px; }
      .suggestion { display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:11px; background:var(--ems-surplus-tile); }
      .suggestion ha-icon { --mdc-icon-size:19px; color:var(--ems-surplus-accent); }
      .suggestion-text { flex:1; min-width:0; }
      .suggestion-name { font-size:.78rem; font-weight:600; }
      .suggestion-threshold { font-size:.67rem; opacity:.6; margin-top:2px; }
      .available { color:var(--ems-surplus-accent); }
      .suggestion[data-action="true"] { cursor:pointer; }
    </style><ha-card><div class="header"><ha-icon icon="mdi:solar-power"></ha-icon><h1></h1></div><div class="reading"><span class="reading-label">Teruglevering naar net</span><b class="reading-value"></b></div><div class="track"><div class="fill"></div></div><div class="hint"></div><div class="suggestions"></div></ha-card>`;
    this._card = this.shadowRoot.querySelector("ha-card");
    this._title = this.shadowRoot.querySelector("h1");
    this._value = this.shadowRoot.querySelector(".reading-value");
    this._fill = this.shadowRoot.querySelector(".fill");
    this._hint = this.shadowRoot.querySelector(".hint");
    this._suggestionsEl = this.shadowRoot.querySelector(".suggestions");
    this._built = true;
  }

  _render() {
    if (!this._hass) return;
    if (!this._built) this._build();
    const cfg = this._config;
    const surplus = this._surplus(cfg.surplus_entity);
    const max = Math.max(Number(cfg.display_max) || 5000, Number(cfg.threshold) || 0, surplus);
    this._card.style.setProperty("--ems-surplus-bg", toCssColor(cfg.background_color, "#1d3b33"));
    this._card.style.setProperty("--ems-surplus-tile", toCssColor(cfg.tile_color, "rgba(255,255,255,.07)"));
    this._card.style.setProperty("--ems-surplus-accent", toCssColor(cfg.accent_color, "#e8c547"));
    this._card.style.setProperty("--ems-surplus-text", toCssColor(cfg.text_color, "#ffffff"));
    this._title.textContent = cfg.title || "Zonne-overschot";
    this._value.textContent = this._format(surplus);
    this._fill.style.width = `${Math.min(100, surplus / max * 100)}%`;
    this._hint.textContent = surplus >= (Number(cfg.threshold) || 0)
      ? "Er is voldoende overschot voor een extra verbruiker."
      : `Advies verschijnt vanaf ${this._format(Number(cfg.threshold) || 0)} overschot.`;
    this._suggestionsEl.innerHTML = "";
    for (const suggestion of this._suggestions()) {
      const statusEntity = suggestion.statusEntity || suggestion.actionEntity;
      const isOn = statusEntity && ["on", "home", "true", "active", "running", "heat", "cool", "auto", "dry", "fan_only"].includes(this._state(statusEntity)?.state);
      const shouldStart = surplus >= suggestion.threshold;
      const shouldStop = isOn && Number.isFinite(suggestion.offThreshold) && surplus <= suggestion.offThreshold;
      if (!shouldStart && !isOn) continue;
      const row = document.createElement("div");
      row.className = "suggestion";
      row.dataset.action = String(Boolean(suggestion.actionEntity || suggestion.entity));
      const icon = document.createElement("ha-icon");
      icon.setAttribute("icon", suggestion.icon);
      const text = document.createElement("div");
      text.className = "suggestion-text";
      const name = document.createElement("div");
      name.className = "suggestion-name";
      name.textContent = suggestion.label;
      const threshold = document.createElement("div");
      threshold.className = "suggestion-threshold";
      threshold.textContent = shouldStop
        ? "Te weinig overschot · tik om uit te schakelen"
        : suggestion.actionEntity ? "Nu beschikbaar · tik om te activeren" : "Nu beschikbaar";
      threshold.classList.add("available");
      text.append(name, threshold);
      row.append(icon, text);
      if (suggestion.actionEntity) {
        row.addEventListener("click", () => {
          const domain = suggestion.actionEntity.split(".")[0];
          if (domain === "climate") {
            if (shouldStop) {
              this._hass.callService("climate", "turn_off", { entity_id: suggestion.actionEntity });
            } else {
              this._hass.callService("climate", "set_hvac_mode", {
                entity_id: suggestion.actionEntity,
                hvac_mode: this._config[`suggestion_${this._suggestions().indexOf(suggestion) + 1}_hvac_mode`] || "auto",
              });
            }
          } else if (["switch", "light", "input_boolean", "fan"].includes(domain)) {
            this._hass.callService(domain, shouldStop ? "turn_off" : "turn_on", { entity_id: suggestion.actionEntity });
          } else {
            this._moreInfo(suggestion.actionEntity);
          }
        });
      } else if (suggestion.entity) {
        row.addEventListener("click", () => this._moreInfo(suggestion.entity));
      }
      this._suggestionsEl.appendChild(row);
    }
  }
}

class EmsSurplusCardEditor extends HTMLElement {
  setConfig(config) { this._config = { ...STYLE_DEFAULTS, ...config }; this._render(); }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; }
  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      const schema = [
        { name: "title", selector: { text: {} } },
        { name: "surplus_entity", selector: { entity: { domain: ["sensor"] } } },
        { name: "invert_surplus_entity", selector: { boolean: {} } },
        { name: "threshold", selector: { number: { min: 0, max: 25000, step: 50, mode: "box" } } },
        { name: "display_max", selector: { number: { min: 500, max: 50000, step: 500, mode: "box" } } },
      ];
      for (let index = 1; index <= 3; index += 1) {
        schema.push({ name: `suggestion_${index}_name`, selector: { text: {} } });
        schema.push({ name: `suggestion_${index}_threshold`, selector: { number: { min: 0, max: 25000, step: 50, mode: "box" } } });
        schema.push({ name: `suggestion_${index}_off_threshold`, selector: { number: { min: 0, max: 25000, step: 50, mode: "box" } } });
        schema.push({ name: `suggestion_${index}_icon`, selector: { icon: {} } });
        schema.push({ name: `suggestion_${index}_entity`, selector: { entity: {} } });
        schema.push({ name: `suggestion_${index}_action_entity`, selector: { entity: { domain: ["switch", "light", "input_boolean", "fan", "climate"] } } });
        schema.push({ name: `suggestion_${index}_status_entity`, selector: { entity: {} } });
        schema.push({ name: `suggestion_${index}_hvac_mode`, selector: { select: { options: ["auto", "cool", "heat", "dry", "fan_only"], mode: "dropdown" } } });
      }
      schema.push({ name: "background_color", selector: { color_rgb: {} } }, { name: "accent_color", selector: { color_rgb: {} } }, { name: "text_color", selector: { color_rgb: {} } }, { name: "tile_color", selector: { color_rgb: {} } });
      const labels = { title: "Titel", surplus_entity: "Netvermogen (+ import / - export)", invert_surplus_entity: "Negatief vermogen als overschot gebruiken", threshold: "Algemene adviesdrempel (W)", display_max: "Schaal van de balk (W)", background_color: "Achtergrondkleur", accent_color: "Accentkleur", text_color: "Tekstkleur", tile_color: "Tegelkleur" };
      for (let index = 1; index <= 3; index += 1) { labels[`suggestion_${index}_name`] = `Advies ${index} naam`; labels[`suggestion_${index}_threshold`] = `Advies ${index} inschakelen vanaf (W)`; labels[`suggestion_${index}_off_threshold`] = `Advies ${index} uitschakelen onder (W)`; labels[`suggestion_${index}_icon`] = `Advies ${index} icoon`; labels[`suggestion_${index}_entity`] = `Advies ${index} meer-info (optioneel)`; labels[`suggestion_${index}_action_entity`] = `Advies ${index} activeren (optioneel)`; labels[`suggestion_${index}_status_entity`] = `Advies ${index} status aan/uit`; labels[`suggestion_${index}_hvac_mode`] = `Advies ${index} climate-modus`; }
      this._form.schema = schema;
      this._form.computeLabel = (field) => labels[field.name] || field.name;
      this._form.addEventListener("value-changed", (event) => this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { type: "custom:ems-surplus-card", ...event.detail.value } }, bubbles: true, composed: true })));
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
  }
}

customElements.define("ems-surplus-card", EmsSurplusCard);
customElements.define("ems-surplus-card-editor", EmsSurplusCardEditor);

customElements.define("ems-phases-card", EmsPhasesCard);
customElements.define("ems-phases-card-editor", EmsPhasesCardEditor);

customElements.define("ems-energy-insights-card", EmsEnergyInsightsCard);
customElements.define("ems-energy-insights-card-editor", EmsEnergyInsightsCardEditor);

customElements.define("ems-overview-card", EmsOverviewCard);
customElements.define("ems-overview-card-editor", EmsOverviewCardEditor);
customElements.define("ems-devices-card", EmsDevicesCard);
customElements.define("ems-devices-card-editor", EmsDevicesCardEditor);
customElements.define("ems-consumers-card", EmsConsumersCard);
customElements.define("ems-consumers-card-editor", EmsConsumersCardEditor);

window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: "ems-overview-card",
    name: "EMS Overzicht",
    description: "Real-time verbruik met weer, tegels en energiestroom.",
    preview: true,
    documentationURL: "https://github.com/Thedeed99/ha-ems-cards",
  },
  {
    type: "ems-devices-card",
    name: "EMS Apparaten",
    description: "Raster met vermogen per apparaat, tik om te schakelen.",
    preview: true,
    documentationURL: "https://github.com/Thedeed99/ha-ems-cards",
  },
  {
    type: "ems-consumers-card",
    name: "EMS Verbruikers",
    description: "Losse verbruikers in een passend EMS-raster met lichte tekst en dezelfde achtergrond.",
    preview: true,
    documentationURL: "https://github.com/Thedeed99/ha-ems-cards",
  },
  {
    type: "ems-energy-insights-card",
    name: "EMS Energie-inzichten",
    description: "Totaal stroomverbruik en teruglevering per uur en per dag.",
    preview: true,
    documentationURL: "https://github.com/Thedeed99/ha-ems-cards",
  },
  {
    type: "ems-phases-card",
    name: "EMS Fasen",
    description: "Vermogen, stroom, voltage en groepenoverzicht per fase.",
    preview: true,
    documentationURL: "https://github.com/Thedeed99/ha-ems-cards",
  },
  {
    type: "ems-surplus-card",
    name: "EMS Zonne-overschot",
    description: "Advies voor laden of extra verbruik bij echte teruglevering naar het net.",
    preview: true,
    documentationURL: "https://github.com/Thedeed99/ha-ems-cards",
  }
);
