/**
 * HA EMS Cards — dashboardkaarten voor energiebeheer in Home Assistant.
 * Zelfde huisstijl als de Zaptec Go 2 Card: eigen achtergrond-, accent- en tekstkleur,
 * en volledige configuratie via de Lovelace UI-editor.
 */

const CARD_VERSION = "1.2.0";

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
  inverter_size: 2.5,
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
    return value.toLocaleString(language, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
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
      .flow-dots { display: flex; gap: 6px; margin-top: 6px; padding: 0 42px; }
      .flow-dots span {
        flex: 1; height: 4px; border-radius: 2px; background: var(--ems-accent);
        opacity: .25; animation: ems-pulse 1.6s linear infinite;
      }
      @keyframes ems-pulse { 0%, 100% { opacity: .15; } 50% { opacity: .9; } }
      .flow[data-flowing="false"] .flow-dots span { animation: none; opacity: .15; }
      .solar { margin-top: 16px; }
      .solar-head { display: flex; justify-content: space-between; align-items: baseline; }
      .solar-title { font-size: .95rem; font-weight: 600; }
      .solar-scale { font-size: .72rem; opacity: .55; }
      .solar-track {
        position: relative; display: flex; height: 26px; border-radius: 13px;
        background: var(--ems-tile); overflow: hidden; margin-top: 8px;
      }
      .solar-seg { height: 100%; width: 0%; transition: width .5s ease; }
      .solar-forecast {
        position: absolute; top: 0; bottom: 0; width: 2px; left: 0;
        background: var(--ems-text); opacity: .55; transition: left .5s ease;
      }
      .solar-ev-track {
        height: 6px; border-radius: 3px; background: var(--ems-tile);
        overflow: hidden; margin-top: 6px;
      }
      .solar-ev-fill { height: 100%; width: 0%; background: var(--ems-ev); transition: width .5s ease; }
      .solar-today { font-size: .72rem; opacity: .6; margin-top: 6px; cursor: pointer; }
      .solar-legend {
        display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; font-size: .72rem;
      }
      .solar-legend div { display: flex; align-items: center; gap: 5px; opacity: .85; }
      .solar-legend i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
      .solar-legend b { font-weight: 600; }
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

      const track = document.createElement("div");
      track.className = "solar-track";
      this._solarSegs = {};
      for (const key of ["self", "export", "import"]) {
        const seg = document.createElement("div");
        seg.className = "solar-seg";
        track.appendChild(seg);
        this._solarSegs[key] = seg;
      }
      this._solarSegs.self.style.background = "var(--ems-solar)";
      this._solarSegs.export.style.background = "var(--ems-export)";
      this._solarSegs.import.style.background = "var(--ems-import)";

      if (cfg.forecast_entity) {
        this._solarForecast = document.createElement("div");
        this._solarForecast.className = "solar-forecast";
        track.appendChild(this._solarForecast);
      }

      solar.append(head, track);

      this._subBars = [];
      const subBarDefs = [
        { key: "ev", entity: cfg.ev_entity, color: "var(--ems-ev)", label: this._t("ev") },
        {
          key: "consumer_1",
          entity: cfg.consumer_1_entity,
          color: toCssColor(cfg.consumer_1_color, SOLAR_DEFAULTS.consumer_1_color),
          label: cfg.consumer_1_name || this._friendlyName(cfg.consumer_1_entity),
        },
        {
          key: "consumer_2",
          entity: cfg.consumer_2_entity,
          color: toCssColor(cfg.consumer_2_color, SOLAR_DEFAULTS.consumer_2_color),
          label: cfg.consumer_2_name || this._friendlyName(cfg.consumer_2_entity),
        },
      ].filter((def) => def.entity);

      for (const def of subBarDefs) {
        const subTrack = document.createElement("div");
        subTrack.className = "solar-ev-track";
        const fill = document.createElement("div");
        fill.className = "solar-ev-fill";
        fill.style.background = def.color;
        subTrack.appendChild(fill);
        subTrack.addEventListener("click", () => this._fireMoreInfo(def.entity));
        solar.appendChild(subTrack);
        this._subBars.push({ ...def, fill });
      }

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
          { key: "imported", color: "var(--ems-import)", entity: cfg.grid_power_entity, label: this._t("imported") },
          { key: "exported", color: "var(--ems-export)", entity: cfg.grid_power_entity, label: this._t("exported") },
          ...this._subBars.map((bar) => ({ key: bar.key, color: bar.color, entity: bar.entity, label: bar.label })),
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
      const max = Number(cfg.flow_max) || 2500;
      const raw = Number(this._state(cfg.flow_entity)?.state);
      const value = Number.isFinite(raw) ? raw : 0;
      const percentage = Math.max(0, Math.min(100, (Math.abs(value) / max) * 100));
      this._flowFill.style.width = `${percentage}%`;
      this._flowRange.textContent = `0 - ${this._formatNumber(max)} W`;
      this._flowEl.dataset.flowing = String(Math.abs(value) > (Number(cfg.flow_threshold) || 0));
      this._flowLeft.dataset.active = String(value > 0);
      this._flowRight.dataset.active = String(value < 0);
    }

    if (this._solarSegs) {
      const scale = (Number(cfg.inverter_size) || SOLAR_DEFAULTS.inverter_size) * 1000;
      const production = this._power(cfg.production_entity);
      let grid = this._power(cfg.grid_power_entity);
      if (cfg.invert_grid_power) grid = -grid;
      const exported = Math.max(grid, 0);
      const imported = Math.max(-grid, 0);
      const usage = cfg.self_consumption_entity
        ? this._power(cfg.self_consumption_entity)
        : Math.max(production - exported + imported, 0);
      const selfUse = Math.max(production - exported, 0);

      const percentage = (watts) => Math.max(0, Math.min(100, (watts / scale) * 100));
      this._solarSegs.self.style.width = `${percentage(selfUse)}%`;
      this._solarSegs.export.style.width = `${percentage(exported)}%`;
      this._solarSegs.import.style.width = `${percentage(imported)}%`;
      this._solarScale.textContent = `0 - ${this._formatPower(scale)}`;

      if (this._solarForecast) {
        this._solarForecast.style.left = `${percentage(this._power(cfg.forecast_entity))}%`;
      }
      for (const bar of this._subBars) {
        bar.fill.style.width = `${percentage(this._power(bar.entity))}%`;
      }
      if (this._todayEl) {
        this._todayEl.textContent = `${this._t("today")}: ${this._formatValue(
          cfg.production_history_entity,
          Number(cfg.energy_decimals) ?? 1
        )}`;
      }
      if (this._legendEls) {
        const values = {
          production,
          usage,
          imported,
          exported,
        };
        for (const bar of this._subBars) {
          values[bar.key] = this._power(bar.entity);
        }
        for (const [key, el] of Object.entries(this._legendEls)) {
          el.textContent = this._formatPower(values[key] ?? 0);
        }
      }
    }
  }
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
      .tile-value { font-size: 1.6rem; }
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
            { name: "ev_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "consumer_1_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "consumer_1_name", selector: { text: {} } },
            { name: "consumer_2_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "consumer_2_name", selector: { text: {} } },
            { name: "forecast_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "production_history_entity", selector: { entity: { domain: ["sensor"] } } },
            { name: "solar_name", selector: { text: {} } },
            { name: "inverter_size", selector: { number: { min: 0.5, max: 50, step: 0.5, mode: "box" } } },
            { name: "power_unit", selector: { select: { options: ["W", "kW"], mode: "dropdown" } } },
            { name: "decimals", selector: { number: { min: 0, max: 3, step: 1, mode: "box" } } },
            { name: "show_solar_legend", selector: { boolean: {} } },
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
            { name: "flow_left_icon", selector: { icon: {} } },
            { name: "flow_right_icon", selector: { icon: {} } },
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
        { name: "", type: "expandable", title: "Weergave", schema: APPEARANCE_SCHEMA },
      ],
    });
  }
}

customElements.define("ems-overview-card", EmsOverviewCard);
customElements.define("ems-overview-card-editor", EmsOverviewCardEditor);
customElements.define("ems-devices-card", EmsDevicesCard);
customElements.define("ems-devices-card-editor", EmsDevicesCardEditor);

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
  }
);
