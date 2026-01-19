const SB_URL = 'https://ptxlzykwothhhwotjhkc.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0eGx6eWt3b3RoaGh3b3RqaGtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMTkxNzYsImV4cCI6MjA4MTU5NTE3Nn0.p4mAS_7eZMmNwwuzQ4qJgmxRP8ne-VQCa3OviK55AtM';

// Estilos de mapa base
const BASEMAP_STYLES = {
    positron: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    osm: {
        version: 8,
        sources: {
            osm: {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors'
            }
        },
        layers: [{
            id: 'osm',
            type: 'raster',
            source: 'osm'
        }]
    },
    satellite: {
        version: 8,
        sources: {
            satellite: {
                type: 'raster',
                tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                tileSize: 256,
                attribution: '© Esri'
            }
        },
        layers: [{
            id: 'satellite',
            type: 'raster',
            source: 'satellite'
        }]
    }
};

// Paleta de colores para CTN
const CTN_COLORS = {
    'TIERRA AGROPECUARIA': '#f39c12',
    'BOSQUE': '#27ae60',
    'VEGETACION ARBUSTIVA Y HERBACEA': '#52be80',
    'OTRAS TIERRAS': '#95a5a6',
    'PARAMO': '#1abc9c',
    'AREA SIN COBERTURA VEGETAL': '#ecf0f1',
    'MOSAICO AGROPECUARIO': '#e67e22',
    'BOSQUE NATIVO': '#27ae60',
    'AREA SIN COBERTURA VEGETAL': '#bdc3c7'
};

const map = new maplibregl.Map({
    container: 'map',
    style: BASEMAP_STYLES.positron,
    center: [-78.560, -0.509],
    zoom: 10.5
});

const LAYER_CACHE = {};
let currentHoverPopup = null;

// ============================================
// FUNCIONES GLOBALES
// ============================================

window.toggleGroup = function (button) {
    const content = button.nextElementSibling;
    const isOpen = content.classList.contains('open');

    if (isOpen) {
        content.classList.remove('open');
        content.style.display = 'none';
        button.classList.remove('open');
    } else {
        content.classList.add('open');
        content.style.display = 'block';
        button.classList.add('open');
    }
};

// UI Helpers
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-msg">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function setLoading(btn, isLoading, progressText = "Cargando...") {
    if (isLoading) {
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerText;
        btn.innerHTML = `<span class="spinner"></span>${progressText}`;
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText;
        btn.disabled = false;
    }
}

// ============================================
// ANÁLISIS Y COLORACIÓN
// ============================================

window.hideInspector = function () {
    const inspector = document.getElementById('sidebar-right');
    inspector.classList.remove('visible');
};



function analyzeFieldValues(features, fieldName) {
    // Optimización para datasets grandes
    const sampleSize = Math.min(features.length, 1000);
    const sampled = features.length > 1000 ?
        features.filter((_, i) => i % Math.ceil(features.length / 1000) === 0) :
        features;

    const values = sampled
        .map(f => f.properties[fieldName])
        .filter(v => v !== null && v !== undefined && v !== '');

    if (values.length === 0) return null;

    const uniqueValues = [...new Set(values)].slice(0, 100); // Máximo 100 valores únicos
    const isNumeric = values.every(v => typeof v === 'number' || !isNaN(parseFloat(v)));

    return {
        fieldName,
        values,
        uniqueValues,
        isNumeric,
        min: isNumeric ? Math.min(...values.map(v => parseFloat(v))) : null,
        max: isNumeric ? Math.max(...values.map(v => parseFloat(v))) : null,
        count: uniqueValues.length
    };
}

function generateColorExpression(features, tableName) {
    if (!features || features.length === 0) return '#cbd5e1';

    const firstProps = features[0].properties;
    const tableNameLower = tableName.toLowerCase();

    const ignoreFields = ['geom', 'geometry', 'id', 'gid', 'objectid', 'fid'];
    const candidateFields = Object.keys(firstProps)
        .filter(k => !ignoreFields.some(ig => k.toLowerCase().includes(ig)));

    console.log(`📋 Campos en ${tableName}:`, candidateFields);

    // USO DE SUELO - Detectar CTN
    if (tableNameLower.includes('uso') && tableNameLower.includes('suelo')) {
        const ctnField = candidateFields.find(f =>
            f.toLowerCase() === 'ctn2' ||
            f.toLowerCase() === 'ctn1' ||
            f.toLowerCase() === 'ctn_2' ||
            f.toLowerCase() === 'ctn_1'
        );

        if (ctnField) {
            const analysis = analyzeFieldValues(features, ctnField);
            console.log(`🎨 Campo CTN: "${ctnField}"`, analysis.uniqueValues);

            const expr = ['match', ['to-string', ['get', ctnField]]];

            analysis.uniqueValues.forEach(val => {
                const valUpper = String(val).toUpperCase().trim();

                if (CTN_COLORS[valUpper]) {
                    expr.push(String(val), CTN_COLORS[valUpper]);
                } else {
                    // Color por hash
                    let hash = 0;
                    for (let i = 0; i < valUpper.length; i++) {
                        hash = ((hash << 5) - hash) + valUpper.charCodeAt(i);
                        hash = hash & hash;
                    }
                    const hue = Math.abs(hash) % 360;
                    expr.push(String(val), `hsl(${hue}, 70%, 60%)`);
                }
            });

            expr.push('#cbd5e1');
            return expr;
        }
    }

    // CLASE (1-5)
    if (firstProps.clase !== undefined) {
        const analysis = analyzeFieldValues(features, 'clase');
        console.log(`🎯 Campo clase:`, analysis.uniqueValues);

        const colors = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];
        const expr = ['match', ['get', 'clase']];

        analysis.uniqueValues.forEach((val, idx) => {
            expr.push(val, colors[idx % colors.length]);
        });
        expr.push('#cbd5e1');

        return expr;
    }

    // BUSCAR POR PATRÓN
    const patterns = {
        'pendiente': ['pendiente', 'slope', 'grado'],
        'ndvi': ['ndvi', 'valor', 'index'],
        'ndwi': ['ndwi', 'valor'],
        'temperatura': ['temp', 'temperatura'],
        'precipit': ['precip', 'lluvia'],
        'altura': ['altura', 'elev', 'msnm'],
        'conserv': ['prioridad', 'categoria'],
        'riesgo': ['riesgo', 'nivel'],
        'funcional': ['funcional'],
        'presion': ['presion'],
        'retencion': ['retencion'],
        'indice': ['indice', 'ifh', 'ith'],
        'condicion': ['condicion', 'estado']
    };

    let selectedField = null;
    for (const [key, keywords] of Object.entries(patterns)) {
        if (tableNameLower.includes(key)) {
            for (const kw of keywords) {
                selectedField = candidateFields.find(f => f.toLowerCase().includes(kw));
                if (selectedField) break;
            }
            if (selectedField) break;
        }
    }

    if (!selectedField) {
        selectedField = candidateFields.find(f => {
            const val = firstProps[f];
            return typeof val === 'number' || typeof val === 'string';
        });
    }

    if (!selectedField) return '#94a3b8';

    const analysis = analyzeFieldValues(features, selectedField);
    console.log(`🎨 Campo: "${selectedField}"`, analysis);

    // CATEGÓRICO
    if (!analysis.isNumeric || analysis.count <= 10) {
        const colors = ['#22c55e', '#3b82f6', '#eab308', '#f97316', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
        const expr = ['match', ['get', selectedField]];
        analysis.uniqueValues.forEach((val, idx) => {
            expr.push(val, colors[idx % colors.length]);
        });
        expr.push('#cbd5e1');
        return expr;
    }

    // NUMÉRICO
    const { min, max } = analysis;
    const range = max - min;

    let colorScale = [[min, '#dbeafe'], [max, '#1e3a8a']];

    if (tableNameLower.includes('pendiente')) {
        colorScale = [[min, '#22c55e'], [min + range * 0.5, '#eab308'], [max, '#ef4444']];
    } else if (tableNameLower.includes('ndvi') || tableNameLower.includes('ndwi')) {
        colorScale = [[min, '#ef4444'], [min + range * 0.5, '#eab308'], [max, '#22c55e']];
    } else if (tableNameLower.includes('temperatura')) {
        colorScale = [[min, '#3b82f6'], [max, '#dc2626']];
    } else if (tableNameLower.includes('altura')) {
        colorScale = [[min, '#22c55e'], [max, '#ef4444']];
    }

    const expr = ['interpolate', ['linear'], ['get', selectedField]];
    colorScale.forEach(([value, color]) => {
        expr.push(value, color);
    });

    return expr;
}

// ============================================
// FETCH
// ============================================

async function fetchWithRetry(url, options, retries = 5, delay = 1500) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            const backoff = delay * Math.pow(1.5, i);
            await new Promise(resolve => setTimeout(resolve, backoff));
        }
    }
}

async function getTableCount(table) {
    try {
        const response = await fetchWithRetry(
            `${SB_URL}/rest/v1/${table}?select=*&limit=1`,
            {
                method: 'HEAD',
                headers: {
                    'apikey': SB_KEY,
                    'Authorization': `Bearer ${SB_KEY}`,
                    'Prefer': 'count=exact'
                }
            }
        );

        const rangeHeader = response.headers.get('content-range');
        if (!rangeHeader) return 0;
        const count = parseInt(rangeHeader.split('/')[1]);
        return isNaN(count) ? 0 : count;
    } catch (error) {
        console.error(`Error count ${table}:`, error);
        return 0;
    }
}

async function fetchPage(table, offset, limit) {
    await new Promise(resolve => setTimeout(resolve, 100));

    const response = await fetchWithRetry(
        `${SB_URL}/rest/v1/${table}?select=*&offset=${offset}&limit=${limit}`,
        {
            headers: {
                'apikey': SB_KEY,
                'Authorization': `Bearer ${SB_KEY}`,
                'Accept': 'application/geo+json'
            }
        }
    );

    const data = await response.json();
    return data.features || [];
}

async function promisePool(tasks, concurrency = 2) {
    const results = [];
    const executing = [];

    for (const task of tasks) {
        const promise = task().then(result => {
            executing.splice(executing.indexOf(promise), 1);
            return result;
        });

        results.push(promise);
        executing.push(promise);

        if (executing.length >= concurrency) {
            await Promise.race(executing);
        }
    }

    return Promise.all(results);
}

async function fetchFullLayer(table, updateProgressCallback) {
    if (LAYER_CACHE[table]) {
        console.log(`✓ Cache: ${table}`);
        return LAYER_CACHE[table];
    }

    console.log(`⬇ Descargando: ${table}`);
    const totalCount = await getTableCount(table);

    if (totalCount === 0) return { type: "FeatureCollection", features: [] };

    console.log(`📊 Registros: ${totalCount}`);

    const pageSize = 500;
    const concurrency = totalCount > 20000 ? 2 : 3;
    const totalPages = Math.ceil(totalCount / pageSize);

    const tasks = [];
    for (let i = 0; i < totalPages; i++) {
        tasks.push(() => fetchPage(table, i * pageSize, pageSize));
    }

    let completed = 0;
    const allFeatures = [];

    const wrappedTasks = tasks.map(task => async () => {
        try {
            const result = await task();
            completed++;
            if (updateProgressCallback) {
                updateProgressCallback(completed, totalPages);
            }
            return result;
        } catch (error) {
            console.error(`Error página:`, error.message);
            return [];
        }
    });

    const results = await promisePool(wrappedTasks, concurrency);

    results.forEach(pageFeatures => {
        if (Array.isArray(pageFeatures)) {
            pageFeatures.forEach(f => {
                if (f && f.geometry) allFeatures.push(f);
            });
        }
    });

    console.log(`✓ ${allFeatures.length}/${totalCount} features`);

    const fullGeoJSON = { type: "FeatureCollection", features: allFeatures };
    LAYER_CACHE[table] = fullGeoJSON;
    return fullGeoJSON;
}

// ============================================
// BASEMAP
// ============================================

function changeBasemap(styleKey) {
    console.log('Cambiando a:', styleKey);
    const selectedStyle = BASEMAP_STYLES[styleKey];

    // Guardar capas
    const savedLayers = [];
    const savedSources = {};

    const style = map.getStyle();
    if (style && style.layers) {
        style.layers.forEach(layer => {
            if (layer.id.startsWith('4326_') || layer.id === 'parroquias-line' || layer.id.endsWith('-outline')) {
                savedLayers.push(layer);
            }
        });
    }

    if (style && style.sources) {
        Object.keys(style.sources).forEach(sourceId => {
            if (sourceId.startsWith('4326_') || sourceId === 'parroquias_base') {
                savedSources[sourceId] = style.sources[sourceId];
            }
        });
    }

    map.setStyle(selectedStyle);

    map.once('styledata', () => {
        setTimeout(() => {
            Object.entries(savedSources).forEach(([id, source]) => {
                if (!map.getSource(id)) {
                    try {
                        map.addSource(id, source);
                    } catch (e) {
                        console.warn(`Source ${id}:`, e.message);
                    }
                }
            });

            savedLayers.forEach(layer => {
                if (!map.getLayer(layer.id)) {
                    try {
                        map.addLayer({
                            id: layer.id,
                            type: layer.type,
                            source: layer.source,
                            paint: layer.paint || {},
                            layout: layer.layout || {}
                        });
                    } catch (e) {
                        console.warn(`Layer ${layer.id}:`, e.message);
                    }
                }
            });

            showToast(`Mapa: ${styleKey}`, "success");
        }, 500);
    });
}

// ============================================
// COLA DE CARGA
// ============================================

const LOADING_QUEUE = {
    active: 0,
    maxConcurrent: 3,
    queue: [],
    async process() {
        while (this.active < this.maxConcurrent && this.queue.length > 0) {
            this.active++;
            const { table, btn, resolve, reject } = this.queue.shift();

            loadLayerInternal(table, btn)
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    this.active--;
                    this.process();
                });
        }
    },
    add(table, btn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ table, btn, resolve, reject });
            this.process();
        });
    }
};

// ============================================
// CONTROL DE CAPAS
// ============================================

window.ctrlLayer = async function (table, btn) {
    if (map.getLayer(table)) {
        const vis = map.getLayoutProperty(table, 'visibility') || 'visible';
        const newVis = vis === 'visible' ? 'none' : 'visible';
        map.setLayoutProperty(table, 'visibility', newVis);

        if (map.getLayer(`${table}-outline`)) {
            map.setLayoutProperty(`${table}-outline`, 'visibility', newVis);
        }

        btn.classList.toggle('active');
        setTimeout(() => updateLegend(), 150);
        return;
    }

    if (map.getSource(table)) {
        map.setLayoutProperty(table, 'visibility', 'visible');
        if (map.getLayer(`${table}-outline`)) {
            map.setLayoutProperty(`${table}-outline`, 'visibility', 'visible');
        }
        btn.classList.add('active');
        setTimeout(() => updateLegend(), 150);
        return;
    }

    setLoading(btn, true, "En cola...");

    try {
        await LOADING_QUEUE.add(table, btn);
    } catch (e) {
        console.error(`❌ Error ${table}:`, e);
        showToast(`Error: ${e.message}`, "error");
        setLoading(btn, false);
    }
};

async function loadLayerInternal(table, btn) {
    setLoading(btn, true, "Iniciando...");

    const startTime = Date.now();

    const geojson = await fetchFullLayer(table, (current, total) => {
        const percent = Math.round((current / total) * 100);
        setLoading(btn, true, `${percent}%`);
    });

    if (geojson.features.length === 0) {
        showToast("Sin datos", "error");
        setLoading(btn, false);
        return;
    }

    const colorExpression = generateColorExpression(geojson.features, table);

    map.addSource(table, {
        type: 'geojson',
        data: geojson,
        generateId: true
    });

    map.addLayer({
        'id': table,
        'type': 'fill',
        'source': table,
        'paint': {
            'fill-color': colorExpression,
            'fill-opacity': 0.7
        }
    }, 'parroquias-line');

    map.addLayer({
        'id': `${table}-outline`,
        'type': 'line',
        'source': table,
        'paint': {
            'line-color': '#1e293b',
            'line-width': 0.5,
            'line-opacity': 0.4
        }
    }, 'parroquias-line');

    // Configuración de atributos prioritarios por capa
    // Los campos se muestran en el orden especificado

    const LAYER_ATTRIBUTES_CONFIG = {
        // Referencia Territorial
        '4326_parroquias_mejia': {
            priority: ['dpa_despar', 'dpa_descan', 'dpa_despro', 'dpa_valor'],
            exclude: ['x', 'y', 'dpa_parroq', 'dpa_canton', 'dpa_provin']
        },

        // Conservación y Uso
        '4326_zonas_prioritarias_conservacion_mejia': {
            priority: ['prioridad', 'accion', 'justif', 'parroquia', 'area_ha', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['clase', 'id_zpc', 'mapa_id']
        },

        '4326_uso_ocupacion_suelo_mejia': {
            priority: ['ctn2', 'ctn1', 'anio', 'area_ha'],
            exclude: ['fcode', 'are']
        },

        '4326_presion_antropica_mejia': {
            priority: ['categoria', 'tipo_uso', 'intensidad', 'riesgo_ind', 'gestion', 'area_ha', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['id_pa', 'clase', 'mapa_id', 'leyenda', 'parroquia']
        },

        // Condición Ecohidrológica
        '4326_riesgo_hidroecologico_mejia': {
            priority: ['categoria', 'estado', 'accion', 'sensibilid', 'presion', 'impacto', 'area_ha', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['id_irh', 'clase', 'mapa_id', 'parroquia']
        },

        '4326_funcionalidad_uso_suelos_mejia': {
            priority: ['cat_func', 'funcionali', 'cond_hidro', 'rol_hidro', 'nivel_int', 'impacto', 'area_ha', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['clase', 'parroquia']
        },

        '4326_indice_funcionalidad_hidroecologico_mejia': {
            priority: ['categoria', 'estado', 'gestion', 'cond_fis', 'cond_biof', 'riesgo', 'area_ha', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['id_ifh', 'clase', 'mapa_id', 'parroquia']
        },

        '4326_condicion_biofisica_mejia': {
            priority: ['categoria', 'estado_int', 'vulnerab', 'area', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['clase', 'parroquia']
        },

        '4326_ndvi_mejia': {
            priority: ['categoria', 'rango_ndvi', 'cond_bio', 'vigor', 'rol_hidro', 'est_eco', 'area_ha', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['clase', 'leyenda', 'parroquia']
        },

        '4326_ndwi_mejia': {
            priority: ['categoria', 'estado', 'area_ha', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['clase', 'leyenda', 'dpa_despar']
        },

        // Soporte Edáfico-Hidrológico
        '4326_unidades_suelo_mejia': {
            priority: ['categoria', 'unidad', 'sig_edaf', 'cap_ret', 'rol_hidro', 'cond_dren', 'sens_eco', 'imp_gest', 'area_ha', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['otx', 'interpre', 'clase', 'leyenda', 'dpa_despar']
        },

        '4326_retencion_hidirca_suelos_mejia': {
            priority: ['categoria', 'sig_hidro', 'almacen', 'liberacion', 'rol_eco', 'est_hidri', 'uso_sug', 'area_ha_2', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['clase', 'area_ha', 'parroquia']
        },

        '4326_indice_topografico_humedad_mejia': {
            priority: ['categoria', 'ith', 'significad', 'imp_func', 'rol_sist', 'cond_hum', 'din_agua', 'sens_eco', 'imp_gest', 'area_ha', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['clase', 'dpa_despar']
        },

        // Condición Físico-Geomorfológica
        '4326_alturas_mejia': {
            priority: ['categoria', 'rn_alt_md', 'sign', 'imp_hidro', 'prc_domin', 'cond_termi', 'rel_hidri', 'sen_ambien', 'func_terr', 'area_ha'],
            exclude: ['value', 'leyenda', 'dpa_despar']
        },

        '4326_pendientes_mejia': {
            priority: ['categ', 'rgn_pendie', 'imp_hdr', 'prc_domn', 'sign', 'area_ha'],
            exclude: ['value', 'leyenda', 'dpa_despar']
        },

        // Clima
        '4326_temperatura_mejia': {
            priority: ['rango_desc', 'condicion', 'valor_num', 'area_ha', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['clase', 'leyenda', 'dpa_despar']
        },

        '4326_precipitacion_mejia': {
            priority: ['rango_desc', 'condicion', 'valor_num', 'area_ha', 'mensaje', 'efecto_hidro', 'accion_gestion'],
            exclude: ['clase', 'leyenda', 'dpa_despar']
        }
    };

    // Nombres amigables para los atributos
    const FIELD_LABELS = {
        // Generales
        'categoria': 'Categoría',
        'clase': 'Clase',
        'area_ha': 'Área (ha)',
        'parroquia': 'Parroquia',

        // Mensajes y acciones
        'mensaje': 'Interpretación',
        'efecto_hidro': 'Efecto Hidrológico',
        'accion_gestion': 'Acción de Gestión',

        // Parroquias
        'dpa_despar': 'Parroquia',
        'dpa_descan': 'Cantón',
        'dpa_despro': 'Provincia',
        'dpa_valor': 'Código',

        // Conservación
        'prioridad': 'Prioridad',
        'accion': 'Acción Sugerida',
        'justif': 'Justificación',

        // Uso de Suelo
        'ctn1': 'Uso Principal',
        'ctn2': 'Uso Específico',
        'anio': 'Año',

        // Presión Antrópica
        'tipo_uso': 'Tipo de Uso',
        'intensidad': 'Intensidad',
        'riesgo_ind': 'Riesgo Inducido',
        'gestion': 'Gestión Requerida',

        // Riesgo
        'estado': 'Estado',
        'sensibilid': 'Sensibilidad',
        'presion': 'Presión',
        'impacto': 'Impacto',

        // Funcionalidad
        'cat_func': 'Funcionalidad',
        'funcionali': 'Descripción',
        'cond_hidro': 'Condición Hidrológica',
        'rol_hidro': 'Rol Hidrológico',
        'nivel_int': 'Nivel de Intervención',

        // Condición Biofísica
        'cond_fis': 'Condición Física',
        'cond_biof': 'Condición Biofísica',
        'estado_int': 'Estado de Integridad',
        'vulnerab': 'Vulnerabilidad',

        // NDVI
        'rango_ndvi': 'Rango NDVI',
        'cond_bio': 'Condición Biológica',
        'vigor': 'Vigor Vegetativo',
        'est_eco': 'Estado Ecológico',

        // Suelos
        'unidad': 'Unidad de Suelo',
        'sig_edaf': 'Significado Edáfico',
        'cap_ret': 'Capacidad de Retención',
        'cond_dren': 'Condición de Drenaje',
        'sens_eco': 'Sensibilidad Ecológica',
        'imp_gest': 'Importancia Gestión',

        // Retención Hídrica
        'sig_hidro': 'Significado Hidrológico',
        'almacen': 'Capacidad Almacenamiento',
        'liberacion': 'Patrón Liberación',
        'rol_eco': 'Rol Ecológico',
        'est_hidri': 'Estado Hídrico',
        'uso_sug': 'Uso Sugerido',

        // ITH
        'ith': 'Índice ITH',
        'significad': 'Significancia',
        'imp_func': 'Importancia Funcional',
        'rol_sist': 'Rol en Sistema',
        'cond_hum': 'Condición de Humedad',
        'din_agua': 'Dinámica del Agua',

        // Alturas/Pendientes
        'rn_alt_md': 'Rango Altitudinal',
        'sign': 'Significancia',
        'imp_hidro': 'Importancia Hidrológica',
        'prc_domin': 'Proceso Dominante',
        'cond_termi': 'Condición Térmica',
        'rel_hidri': 'Relación Hídrica',
        'sen_ambien': 'Sensibilidad Ambiental',
        'func_terr': 'Función Territorial',
        'categ': 'Categoría',
        'rgn_pendie': 'Rango de Pendiente',
        'imp_hdr': 'Impacto Hidrológico',
        'prc_domn': 'Proceso Dominante',

        // Clima
        'rango_desc': 'Rango',
        'condicion': 'Condición',
        'valor_num': 'Valor Numérico'
    };

    // ============================================
    // FUNCIÓN PARA RENDERIZAR ATRIBUTOS PRIORIZADOS
    // ============================================

    function renderAttributes(props, tableName) {
        const config = LAYER_ATTRIBUTES_CONFIG[tableName] || {};
        const priorityFields = config.priority || [];
        const excludeFields = config.exclude || [];

        // Campos a excluir siempre
        const alwaysExclude = ['geom', 'geometry', 'gid', 'objectid', 'fid'];
        const allExclude = [...alwaysExclude, ...excludeFields];

        // Obtener todos los campos disponibles
        const allFields = Object.keys(props).filter(k => !allExclude.includes(k));

        // Organizar campos en secciones
        const sections = {
            priority: [],
            descriptive: [],
            other: []
        };

        // Campos prioritarios (en orden especificado)
        priorityFields.forEach(field => {
            if (allFields.includes(field) && props[field] != null && props[field] !== '') {
                sections.priority.push(field);
            }
        });

        // Campos descriptivos largos (mensaje, efecto, acción)
        const descriptiveFields = ['mensaje', 'efecto_hidro', 'accion_gestion'];
        descriptiveFields.forEach(field => {
            if (allFields.includes(field) && props[field] != null && props[field] !== '' && !sections.priority.includes(field)) {
                sections.descriptive.push(field);
            }
        });

        // Otros campos (no prioritarios, no descriptivos, no excluidos)
        allFields.forEach(field => {
            if (!sections.priority.includes(field) &&
                !sections.descriptive.includes(field) &&
                props[field] != null &&
                props[field] !== '') {
                sections.other.push(field);
            }
        });

        // Construir HTML
        let html = '';

        // Sección de información principal
        if (sections.priority.length > 0) {
            html += '<div class="attr-section">';
            html += '<div class="section-title">Información Principal</div>';
            sections.priority.forEach(key => {
                const label = FIELD_LABELS[key] || key;
                const value = props[key];
                const displayValue = formatValue(value);

                html += `<div class="attr-row">
                <span class="attr-k">${label}</span>
                <span class="attr-v">${displayValue}</span>
            </div>`;
            });
            html += '</div>';
        }

        // Sección descriptiva (mensajes largos)
        if (sections.descriptive.length > 0) {
            html += '<div class="attr-section">';
            html += '<div class="section-title">Análisis e Interpretación</div>';
            sections.descriptive.forEach(key => {
                const label = FIELD_LABELS[key] || key;
                const value = props[key];

                html += `<div class="attr-row">
                <span class="attr-k">${label}</span>
                <div class="attr-v long-text">${value}</div>
            </div>`;
            });
            html += '</div>';
        }

        // Otros atributos (colapsados)
        if (sections.other.length > 0) {
            html += '<div class="attr-section">';
            html += '<div class="section-title">Otros Atributos</div>';
            sections.other.slice(0, 10).forEach(key => {  // Máximo 10 campos adicionales
                const label = FIELD_LABELS[key] || key;
                const value = props[key];
                const displayValue = formatValue(value);

                html += `<div class="attr-row">
                <span class="attr-k">${label}</span>
                <span class="attr-v">${displayValue}</span>
            </div>`;
            });
            html += '</div>';
        }

        return html || '<p style="color: #94a3b8; text-align: center; padding: 20px;">Sin atributos para mostrar</p>';
    }

    function formatValue(value) {
        if (value === null || value === undefined || value === '') {
            return '<span style="color: #cbd5e1;">N/A</span>';
        }

        if (typeof value === 'number') {
            // Formatear números con máximo 3 decimales
            return value % 1 === 0 ? value.toString() : value.toFixed(3);
        }

        return value;
    }

    function showInspector(tableName) {
        const inspector = document.getElementById('sidebar-right');
        const layerTag = document.getElementById('layer-tag');
        const layerTitle = document.querySelector('.inspector-header h4');

        // Obtener nombre limpio de la capa
        const cleanName = tableName.split('_').slice(1).join(' ');

        layerTag.textContent = cleanName.toUpperCase();
        layerTitle.textContent = cleanName;

        inspector.classList.add('visible');
    }




    // Click event - ACTUALIZADO con priorización
    map.on('click', table, (e) => {
        const props = e.features[0].properties;
        const html = renderAttributes(props, table);

        document.getElementById('details').innerHTML = html;
        showInspector(table);
    });

    // Hover tooltip - MEJORADO
    map.on('mousemove', table, (e) => {
        map.getCanvas().style.cursor = 'pointer';

        const props = e.features[0].properties;

        // Buscar campo de nombre/descripción con prioridad
        let displayName = null;

        // Prioridad 1: Campos explícitos de nombre
        const nameFields = ['nombre', 'name', 'descripcion', 'description'];
        for (const field of nameFields) {
            const found = Object.keys(props).find(k => k.toLowerCase() === field);
            if (found && props[found]) {
                displayName = props[found];
                break;
            }
        }

        // Prioridad 2: CTN (para uso de suelo)
        if (!displayName) {
            const ctnField = Object.keys(props).find(k =>
                k.toLowerCase() === 'ctn2' || k.toLowerCase() === 'ctn1'
            );
            if (ctnField && props[ctnField]) {
                displayName = props[ctnField];
            }
        }

        // Prioridad 3: Tipo o categoría
        if (!displayName) {
            const typeField = Object.keys(props).find(k =>
                k.toLowerCase() === 'tipo' ||
                k.toLowerCase() === 'categoria' ||
                k.toLowerCase() === 'fcode'
            );
            if (typeField && props[typeField]) {
                displayName = props[typeField];
            }
        }

        // Prioridad 4: Clase
        if (!displayName && props.clase) {
            displayName = `Clase ${props.clase}`;
        }

        // Fallback: Primer campo no-geom
        if (!displayName) {
            const firstField = Object.keys(props).find(k =>
                !['geom', 'geometry', 'id', 'gid', 'objectid', 'fid'].includes(k.toLowerCase())
            );
            if (firstField && props[firstField]) {
                displayName = `${firstField}: ${props[firstField]}`;
            } else {
                displayName = table.split('_').slice(1, 3).join(' ');
            }
        }

        if (currentHoverPopup) currentHoverPopup.remove();

        currentHoverPopup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'hover-popup',
            offset: 10
        })
            .setLngLat(e.lngLat)
            .setHTML(`<strong>${displayName}</strong>`)
            .addTo(map);
    });

    map.on('mouseleave', table, () => {
        map.getCanvas().style.cursor = '';
        if (currentHoverPopup) {
            currentHoverPopup.remove();
            currentHoverPopup = null;
        }
    });

    // Fit bounds
    const bounds = new maplibregl.LngLatBounds();
    geojson.features.forEach(feature => {
        if (feature.geometry && feature.geometry.type !== 'Point') {
            const coords = feature.geometry.coordinates.flat(Infinity);
            for (let i = 0; i < coords.length; i += 2) {
                if (coords[i] && coords[i + 1]) {
                    bounds.extend([coords[i], coords[i + 1]]);
                }
            }
        }
    });

    if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 50, duration: 1000 });
    }

    btn.classList.add('active');
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
    showToast(`✓ ${geojson.features.length} elementos (${loadTime}s)`, "success");
    console.log(`✅ ${table}: ${geojson.features.length} features en ${loadTime}s`);

    setLoading(btn, false);
    updateLegend();

}

// ============================================
// SISTEMA DE LEYENDA AUTOMÁTICA
// ============================================

function updateLegend() {
    const legendContainer = document.getElementById('legend-container');
    const legendTitle = document.getElementById('legend-title');
    const legendContent = document.getElementById('legend-content');
    
    if (!legendContainer || !legendTitle || !legendContent) {
        console.warn('⚠️ Elementos de leyenda no encontrados en el DOM');
        return;
    }
    
    // Obtener todas las capas del estilo actual
    const visibleLayers = [];
    
    try {
        const allLayers = map.getStyle().layers;
        
        for (const layer of allLayers) {
            // Solo procesar capas que empiecen con 4326_ y no sean parroquias/outline/reportes
            if (layer.id && 
                layer.id.startsWith('4326_') && 
                layer.id !== '4326_parroquias_mejia' &&
                !layer.id.includes('outline') &&
                !layer.id.includes('reportes')) {
                
                const visibility = map.getLayoutProperty(layer.id, 'visibility');
                
                // Una capa es visible si visibility es 'visible' explícitamente
                if (visibility === 'visible') {
                    visibleLayers.push(layer.id);
                    console.log('✓ Capa visible detectada:', layer.id);
                }
            }
        }
    } catch (error) {
        console.error('Error al obtener capas:', error);
        return;
    }
    
    console.log(`📊 Total de capas visibles: ${visibleLayers.length}`);
    
    // Si no hay capas visibles, ocultar leyenda
    if (visibleLayers.length === 0) {
        console.log('❌ No hay capas visibles - ocultando leyenda');
        legendContainer.classList.remove('active');
        legendTitle.textContent = '';
        legendContent.innerHTML = '';
        return;
    }
    
    // Usar la última capa activada
    const lastLayer = visibleLayers[visibleLayers.length - 1];
    console.log('🎯 Generando leyenda para:', lastLayer);
    
    const legendData = extractLegendData(lastLayer);
    
    if (!legendData || legendData.items.length === 0) {
        console.warn('⚠️ No se pudo extraer datos de leyenda para:', lastLayer);
        legendContainer.classList.remove('active');
        return;
    }
    
    // Actualizar contenido de la leyenda
    legendTitle.textContent = legendData.title;
    legendContent.innerHTML = '';
    
    legendData.items.forEach((item, index) => {
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        
        const colorBox = document.createElement('div');
        colorBox.className = 'legend-color';
        colorBox.style.backgroundColor = item.color;
        
        const label = document.createElement('span');
        label.className = 'legend-label';
        label.textContent = item.label;
        
        legendItem.appendChild(colorBox);
        legendItem.appendChild(label);
        legendContent.appendChild(legendItem);
    });
    
    // Mostrar leyenda con animación
    legendContainer.classList.add('active');
    console.log('✅ Leyenda activada con', legendData.items.length, 'items');
}

function extractLegendData(layerId) {
    const source = map.getSource(layerId);
    if (!source || !source._data || !source._data.features) {
        console.warn('⚠️ No se encontró source o features para:', layerId);
        return null;
    }
    
    const features = source._data.features;
    if (features.length === 0) {
        console.warn('⚠️ La capa no tiene features:', layerId);
        return null;
    }
    
    console.log(`📦 Capa ${layerId} tiene ${features.length} features`);
    
    // Obtener el layer del estilo
    const layer = map.getStyle().layers.find(l => l.id === layerId);
    if (!layer || !layer.paint || !layer.paint['fill-color']) {
        console.warn('⚠️ No se encontró paint/fill-color para:', layerId);
        return null;
    }
    
    const colorExpr = layer.paint['fill-color'];
    console.log('🎨 Expresión de color:', Array.isArray(colorExpr) ? colorExpr[0] : typeof colorExpr);
    
    // Nombres amigables de capas
    const layerNames = {
        '4326_riesgo_hidroecologico_mejia': 'Riesgo Hidroecológico',
        '4326_funcionalidad_uso_suelos_mejia': 'Funcionalidad de Uso',
        '4326_indice_funcionalidad_hidroecologico_mejia': 'Índice IFH',
        '4326_ndvi_mejia': 'NDVI (Vegetación)',
        '4326_ndwi_mejia': 'NDWI (Agua)',
        '4326_uso_ocupacion_suelo_mejia': 'Uso de Suelo',
        '4326_zonas_prioritarias_conservacion_mejia': 'Zonas de Conservación',
        '4326_presion_antropica_mejia': 'Presión Antrópica',
        '4326_unidades_suelo_mejia': 'Unidades de Suelo',
        '4326_retencion_hidirca_suelos_mejia': 'Retención Hídrica',
        '4326_indice_topografico_humedad_mejia': 'Índice ITH',
        '4326_alturas_mejia': 'Altimetría',
        '4326_pendientes_mejia': 'Pendientes',
        '4326_temperatura_mejia': 'Temperatura',
        '4326_precipitacion_mejia': 'Precipitación',
        '4326_condicion_biofisica_mejia': 'Condición Biofísica'
    };
    
    const title = layerNames[layerId] || layerId.replace(/4326_|_mejia/g, '').replace(/_/g, ' ');
    
    // Procesar expresión MATCH (categórico)
    if (Array.isArray(colorExpr) && colorExpr[0] === 'match') {
        const items = [];
        for (let i = 2; i < colorExpr.length - 1; i += 2) {
            const value = colorExpr[i];
            const color = colorExpr[i + 1];
            items.push({ label: String(value), color: color });
        }
        console.log(`✅ Leyenda categórica: ${items.length} items`);
        return { title: title, items: items.slice(0, 8) };
    }
    
    // Procesar expresión INTERPOLATE (numérico)
    if (Array.isArray(colorExpr) && colorExpr[0] === 'interpolate') {
        const items = [];
        for (let i = 3; i < colorExpr.length; i += 2) {
            const value = colorExpr[i];
            const color = colorExpr[i + 1];
            items.push({
                label: typeof value === 'number' ? value.toFixed(1) : String(value),
                color: color
            });
        }
        console.log(`✅ Leyenda numérica: ${items.length} items`);
        return { title: title, items: items };
    }
    
    // Color sólido
    if (typeof colorExpr === 'string') {
        console.log('✅ Leyenda color sólido');
        return { 
            title: title, 
            items: [{ label: 'Todas las áreas', color: colorExpr }] 
        };
    }
    
    console.warn('⚠️ Tipo de expresión de color no reconocido');
    return null;
}



// ============================================
// INIT
// ============================================

map.on('load', async () => {
    try {
        showToast("Cargando base...", "info");
        const data = await fetchFullLayer('4326_parroquias_mejia');

        map.addSource('parroquias_base', { type: 'geojson', data });
        map.addLayer({
            'id': 'parroquias-line',
            'type': 'line',
            'source': 'parroquias_base',
            'paint': {
                'line-color': '#334155',
                'line-width': 2,
                'line-opacity': 0.8
            }
        });

        showToast(`Base: ${data.features.length} parroquias`, "success");
    } catch (e) {
        console.error("Error:", e);
        showToast("Error cargando base", "error");
    }
});

// Basemap selector
window.addEventListener('load', () => {
    const dropdown = document.getElementById('basemap-dropdown');
    if (dropdown) {
        dropdown.addEventListener('change', (e) => {
            changeBasemap(e.target.value);
        });
        console.log('✓ Basemap selector activado');
    }
});

// Debug
window.clearLayerCache = () => {
    Object.keys(LAYER_CACHE).forEach(key => delete LAYER_CACHE[key]);
    console.log('✓ Cache limpiado');
};

window.inspectLayer = (table) => {
    const geojson = LAYER_CACHE[table];
    if (!geojson) {
        console.log(`❌ ${table} no en cache`);
        return;
    }
    console.log(`📊 ${table}:`, geojson.features[0].properties);
};

console.log('✅ Mejía GIS cargado');
console.log('   - toggleGroup:', typeof window.toggleGroup);
console.log('   - ctrlLayer:', typeof window.ctrlLayer);// ============================================
// MÓDULO DE REPORTES HIDROECOLÓGICOS
// Sistema de denuncias en tiempo real
// ============================================

const REPORTES_CONFIG = {
    supabaseUrl: 'https://ptxlzykwothhhwotjhkc.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0eGx6eWt3b3RoaGh3b3RqaGtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMTkxNzYsImV4cCI6MjA4MTU5NTE3Nn0.p4mAS_7eZMmNwwuzQ4qJgmxRP8ne-VQCa3OviK55AtM',
    tableName: 'reportes_hidroecologicos'
};

// Supabase client
const supabaseReportes = window.supabase?.createClient(
    REPORTES_CONFIG.supabaseUrl,
    REPORTES_CONFIG.supabaseKey
);

// Estado del módulo de reportes
const reportesState = {
    modoReporte: false,
    coordenadasSeleccionadas: null,
    marker: null,
    reportesLayer: null,
    subscription: null
};

// ============================================
// CREAR REPORTE CON GEOLOCALIZACIÓN AUTOMÁTICA
// ============================================

window.crearReporteConGeolocalizacion = async function () {
    const btn = document.getElementById('btn-reporte-flotante');

    // Verificar si el navegador soporta geolocalización
    if (!navigator.geolocation) {
        showToast('❌ Tu navegador no soporta geolocalización', 'error');
        return;
    }

    // Mostrar estado de carga
    btn.classList.add('loading');
    btn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
        </svg>
        <span>Ubicando...</span>
    `;

    showToast('📍 Obteniendo tu ubicación...', 'info');

    // Obtener ubicación del dispositivo
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude, accuracy } = position.coords;

            reportesState.coordenadasSeleccionadas = {
                lng: longitude,
                lat: latitude,
                precision: accuracy
            };

            // Agregar marker temporal en el mapa
            if (reportesState.marker) {
                reportesState.marker.remove();
            }

            reportesState.marker = new maplibregl.Marker({
                color: '#10b981',
                scale: 1.2
            })
                .setLngLat([longitude, latitude])
                .addTo(map);

            // Agregar círculo de precisión
            if (map.getSource('precision-circle')) {
                map.removeLayer('precision-circle-layer');
                map.removeSource('precision-circle');
            }

            map.addSource('precision-circle', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [longitude, latitude]
                    }
                }
            });

            map.addLayer({
                id: 'precision-circle-layer',
                type: 'circle',
                source: 'precision-circle',
                paint: {
                    'circle-radius': {
                        stops: [
                            [0, 0],
                            [20, accuracy / 2] // Escala aproximada
                        ],
                        base: 2
                    },
                    'circle-color': '#10b981',
                    'circle-opacity': 0.2,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#10b981',
                    'circle-stroke-opacity': 0.5
                }
            });

            // Centrar el mapa en la ubicación
            map.flyTo({
                center: [longitude, latitude],
                zoom: 16,
                duration: 2000
            });

            showToast(`✅ Ubicación obtenida (±${accuracy.toFixed(0)}m)`, 'success');

            // Obtener contexto territorial
            const contexto = await obtenerContextoTerritorial(longitude, latitude);
            contexto.precision = accuracy;

            // Restaurar botón
            btn.classList.remove('loading');
            btn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v20M2 12h20"/>
                </svg>
                <span>Reportar</span>
            `;

            // Abrir formulario
            abrirFormularioReporte(contexto);
        },
        (error) => {
            // Error al obtener ubicación
            btn.classList.remove('loading');
            btn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v20M2 12h20"/>
                </svg>
                <span>Reportar</span>
            `;

            let errorMsg = 'Error al obtener ubicación';

            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = 'Permiso de ubicación denegado. Por favor, habilítalo en la configuración de tu navegador.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = 'Información de ubicación no disponible.';
                    break;
                case error.TIMEOUT:
                    errorMsg = 'Tiempo de espera agotado al obtener ubicación.';
                    break;
            }

            showToast('❌ ' + errorMsg, 'error');
            console.error('Error de geolocalización:', error);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
};

// Función legacy eliminada - ya no se usa modo de click en mapa
window.activarModoReporte = function () {
    showToast('ℹ️ Usa el botón flotante para crear un reporte con tu ubicación', 'info');
};

window.desactivarModoReporte = function () {
    reportesState.modoReporte = false;
    if (reportesState.marker) {
        reportesState.marker.remove();
        reportesState.marker = null;
    }
};

// ============================================
// OBTENER CONTEXTO TERRITORIAL
// ============================================

async function obtenerContextoTerritorial(lng, lat) {
    const contexto = {
        coordenadas: { lng, lat },
        parroquia: 'Consultando...',
        capaActiva: null,
        funcionalidad: null,
        riesgo: null,
        categoria: null,
        capasEnPunto: {}
    };

    // 1. Obtener parroquia desde Supabase
    try {
        const { data, error } = await supabaseReportes.rpc('get_parroquia_from_coords', {
            lat: lat,
            lon: lng
        });

        if (!error && data) {
            contexto.parroquia = data;
        }
    } catch (err) {
        console.warn('Error obteniendo parroquia:', err);
    }

    // 2. Consultar capas activas en ese punto
    const capasActivas = map.getStyle().layers
        .filter(l => l.id.includes('4326_') && map.getLayoutProperty(l.id, 'visibility') !== 'none')
        .map(l => l.id.split('-')[0])
        .filter((v, i, a) => a.indexOf(v) === i); // unique

    for (const layerId of capasActivas) {
        const features = map.queryRenderedFeatures(
            map.project([lng, lat]),
            { layers: [layerId] }
        );

        if (features.length > 0) {
            const props = features[0].properties;
            contexto.capasEnPunto[layerId] = props;

            // Determinar capa principal (primera activa con datos)
            if (!contexto.capaActiva) {
                contexto.capaActiva = layerId;
            }

            // Extraer información clave
            if (layerId.includes('funcionalidad') && props.funcionali) {
                contexto.funcionalidad = props.funcionali;
            }
            if (layerId.includes('riesgo') && props.categoria) {
                contexto.riesgo = props.categoria;
            }
            if (props.categoria) {
                contexto.categoria = props.categoria;
            }
        }
    }

    return contexto;
}

// ============================================
// FORMULARIO DE REPORTE
// ============================================

function abrirFormularioReporte(contexto) {
    desactivarModoReporte();

    const formHtml = `
        <div id="reporte-form-modal" class="modal-overlay">
            <div class="modal-content reporte-form">
                <div class="modal-header">
                    <h3>📋 Nuevo Reporte Hidroecológico</h3>
                    <button class="modal-close" onclick="cerrarFormularioReporte()">×</button>
                </div>
                
                <form id="form-reporte" class="reporte-form-content">
                    <!-- 1. UBICACIÓN -->
                    <fieldset class="form-section">
                        <legend>📍 Ubicación del Reporte (GPS Automático)</legend>
                        
                        <div class="form-group">
                            <label>Coordenadas obtenidas por GPS</label>
                            <div class="coord-display">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span>📍 Lat: ${contexto.coordenadas.lat.toFixed(6)}, Lng: ${contexto.coordenadas.lng.toFixed(6)}</span>
                                </div>
                                ${contexto.precision ? `<div style="margin-top: 6px; font-size: 10px; color: #10b981;">✓ Precisión: ±${contexto.precision.toFixed(0)}m</div>` : ''}
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Parroquia</label>
                            <input type="text" name="parroquia" value="${contexto.parroquia}" readonly>
                        </div>
                        
                        <div class="form-group">
                            <label>Sector o Referencia</label>
                            <input type="text" name="sector_referencia" 
                                   placeholder="Ej: Cerca del mercado central" 
                                   value="${contexto.parroquia !== 'Consultando...' ? 'Sector ' + contexto.parroquia : ''}">
                            <small style="font-size: 10px; color: var(--wii-gray); margin-top: 4px; display: block;">
                                Opcional: Agregue una referencia que ayude a ubicar el lugar exacto
                            </small>
                        </div>
                    </fieldset>
                    
                    <!-- 2. CONTEXTO TERRITORIAL -->
                    <fieldset class="form-section collapsible">
                        <legend onclick="toggleSection(this)">
                            <span class="arrow">▶</span> 🗺️ Contexto Territorial (Automático)
                        </legend>
                        <div class="section-content" style="display: none;">
                            <div class="form-group">
                                <label>Capa Activa Principal</label>
                                <input type="text" name="capa_activa_principal" 
                                       value="${contexto.capaActiva || 'Sin capa activa'}" readonly>
                            </div>
                            
                            <div class="form-group">
                                <label>Funcionalidad Hidroecológica</label>
                                <input type="text" name="funcionalidad_hidroecologica" 
                                       value="${contexto.funcionalidad || 'No determinada'}" readonly>
                            </div>
                            
                            <div class="form-group">
                                <label>Riesgo Hidroecológico</label>
                                <input type="text" name="riesgo_hidroecologico" 
                                       value="${contexto.riesgo || 'No determinado'}" readonly>
                            </div>
                            
                            <div class="form-group">
                                <label>Categoría Territorial</label>
                                <input type="text" name="categoria_territorial" 
                                       value="${contexto.categoria || 'No determinada'}" readonly>
                            </div>
                        </div>
                    </fieldset>
                    
                    <!-- 3. TIPO DE REPORTE -->
                    <fieldset class="form-section">
                        <legend>⚠️ Tipo de Incidencia</legend>
                        
                        <div class="form-group radio-group">
                            <label class="radio-option ${sugerirTipoIncidencia(contexto)}">
                                <input type="radio" name="tipo_incidencia" value="riesgo_hidroecologico" 
                                       ${contexto.riesgo ? 'checked' : ''}>
                                <span>Riesgo Hidroecológico</span>
                            </label>
                            
                            <label class="radio-option">
                                <input type="radio" name="tipo_incidencia" value="afectacion_conservacion">
                                <span>Afectación a Zona de Conservación</span>
                            </label>
                            
                            <label class="radio-option">
                                <input type="radio" name="tipo_incidencia" value="cambio_uso_suelo">
                                <span>Cambio en Uso del Suelo</span>
                            </label>
                            
                            <label class="radio-option">
                                <input type="radio" name="tipo_incidencia" value="otro" 
                                       ${!contexto.riesgo ? 'checked' : ''}>
                                <span>Otro</span>
                            </label>
                        </div>
                        
                        <div class="form-group" id="tipo-otro-container" style="display: none;">
                            <label>Especifique</label>
                            <input type="text" name="tipo_incidencia_otro" placeholder="Describa el tipo de incidencia">
                        </div>
                    </fieldset>
                    
                    <!-- 5. IMPACTO PERCIBIDO -->
                    <fieldset class="form-section">
                        <legend>💥 Impacto Percibido</legend>
                        
                        <div class="form-group checkbox-group">
                            <label class="checkbox-option">
                                <input type="checkbox" name="impacto_agua" ${contexto.riesgo ? 'checked' : ''}>
                                <span>Afectación al agua</span>
                            </label>
                            
                            <label class="checkbox-option">
                                <input type="checkbox" name="impacto_suelo">
                                <span>Afectación al suelo</span>
                            </label>
                            
                            <label class="checkbox-option">
                                <input type="checkbox" name="impacto_vegetacion">
                                <span>Afectación a la vegetación</span>
                            </label>
                            
                            <label class="checkbox-option">
                                <input type="checkbox" name="impacto_poblacion">
                                <span>Riesgo para la población</span>
                            </label>
                            
                            <label class="checkbox-option">
                                <input type="checkbox" name="impacto_no_determinado">
                                <span>No determinado</span>
                            </label>
                        </div>
                    </fieldset>
                    
                    <!-- 6. DESCRIPCIÓN (OBLIGATORIO) -->
                    <fieldset class="form-section">
                        <legend>📝 Descripción del Hecho <span class="required">*</span></legend>
                        
                        <div class="form-group">
                            <textarea name="descripcion" rows="4" required 
                                      placeholder="Describa brevemente lo que observó o reporta. Sea claro y específico."></textarea>
                        </div>
                    </fieldset>
                    
                    <!-- 7. DATOS DEL INFORMANTE -->
                    <fieldset class="form-section collapsible">
                        <legend onclick="toggleSection(this)">
                            <span class="arrow">▶</span> 👤 Datos del Informante (Opcional)
                        </legend>
                        <div class="section-content" style="display: none;">
                            <div class="form-group">
                                <label class="checkbox-option">
                                    <input type="checkbox" name="reporte_anonimo" checked 
                                           onchange="toggleInformante(this)">
                                    <span><strong>Reporte Anónimo</strong></span>
                                </label>
                            </div>
                            
                            <div id="datos-informante" style="display: none;">
                                <div class="form-group">
                                    <label>Nombre</label>
                                    <input type="text" name="informante_nombre" placeholder="Nombre completo">
                                </div>
                                
                                <div class="form-group">
                                    <label>Contacto (Email o Teléfono)</label>
                                    <input type="text" name="informante_contacto" placeholder="correo@ejemplo.com o teléfono">
                                </div>
                            </div>
                        </div>
                    </fieldset>
                    
                    <!-- 9. OBSERVACIONES -->
                    <fieldset class="form-section collapsible">
                        <legend onclick="toggleSection(this)">
                            <span class="arrow">▶</span> 💬 Observaciones Adicionales
                        </legend>
                        <div class="section-content" style="display: none;">
                            <div class="form-group">
                                <textarea name="observaciones" rows="3" 
                                          placeholder="Cualquier información adicional que considere relevante..."></textarea>
                            </div>
                        </div>
                    </fieldset>
                    
                    <!-- DATOS OCULTOS -->
                    <input type="hidden" name="latitud" value="${contexto.coordenadas.lat}">
                    <input type="hidden" name="longitud" value="${contexto.coordenadas.lng}">
                    
                    <!-- BOTONES -->
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" onclick="cerrarFormularioReporte()">
                            Cancelar
                        </button>
                        <button type="submit" class="btn-primary">
                            📤 Enviar Reporte
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', formHtml);

    // Event listeners
    document.getElementById('form-reporte').addEventListener('submit', enviarReporte);
    document.querySelectorAll('input[name="tipo_incidencia"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('tipo-otro-container').style.display =
                e.target.value === 'otro' ? 'block' : 'none';
        });
    });
}

function sugerirTipoIncidencia(contexto) {
    if (contexto.riesgo && contexto.riesgo.toLowerCase().includes('alto')) {
        return 'suggested';
    }
    return '';
}

window.toggleSection = function (legend) {
    const content = legend.nextElementSibling;
    const arrow = legend.querySelector('.arrow');

    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.textContent = '▼';
    } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
    }
};

window.toggleInformante = function (checkbox) {
    document.getElementById('datos-informante').style.display =
        checkbox.checked ? 'none' : 'block';
};

window.cerrarFormularioReporte = function () {
    const modal = document.getElementById('reporte-form-modal');
    if (modal) modal.remove();

    if (reportesState.marker) {
        reportesState.marker.remove();
        reportesState.marker = null;
    }

    // Limpiar círculo de precisión
    if (map.getSource('precision-circle')) {
        map.removeLayer('precision-circle-layer');
        map.removeSource('precision-circle');
    }

    reportesState.coordenadasSeleccionadas = null;
};

// ============================================
// ENVIAR REPORTE A SUPABASE
// ============================================

async function enviarReporte(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Procesar checkboxes
    data.impacto_agua = formData.has('impacto_agua');
    data.impacto_suelo = formData.has('impacto_suelo');
    data.impacto_vegetacion = formData.has('impacto_vegetacion');
    data.impacto_poblacion = formData.has('impacto_poblacion');
    data.impacto_no_determinado = formData.has('impacto_no_determinado');
    data.reporte_anonimo = formData.has('reporte_anonimo');

    // Parsear JSON
    try {
    } catch (err) {
    }

    // Construir objeto para Supabase
    const reporte = {
        // Geografía (PostGIS)
        coordenadas: `POINT(${data.longitud} ${data.latitud})`,
        latitud: parseFloat(data.latitud),
        longitud: parseFloat(data.longitud),
        parroquia: data.parroquia,
        sector_referencia: data.sector_referencia || null,

        // Contexto
        capa_activa_principal: data.capa_activa_principal || null,
        funcionalidad_hidroecologica: data.funcionalidad_hidroecologica || null,
        riesgo_hidroecologico: data.riesgo_hidroecologico || null,
        categoria_territorial: data.categoria_territorial || null,

        // Tipo
        tipo_incidencia: data.tipo_incidencia,
        tipo_incidencia_otro: data.tipo_incidencia === 'otro' ? data.tipo_incidencia_otro : null,

        // Impacto
        impacto_agua: data.impacto_agua,
        impacto_suelo: data.impacto_suelo,
        impacto_vegetacion: data.impacto_vegetacion,
        impacto_poblacion: data.impacto_poblacion,
        impacto_no_determinado: data.impacto_no_determinado,

        // Descripción (OBLIGATORIO)
        descripcion: data.descripcion,

        // Informante
        informante_nombre: data.reporte_anonimo ? null : (data.informante_nombre || null),
        informante_contacto: data.reporte_anonimo ? null : (data.informante_contacto || null),
        reporte_anonimo: data.reporte_anonimo,

        // Observaciones
        observaciones: data.observaciones || null,

        // Metadatos
        estado: 'pendiente',
        prioridad: determinarPrioridad(data)
    };

    // Mostrar loading
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner"></span> Enviando...';
    submitBtn.disabled = true;

    try {
        const { data: insertedData, error } = await supabaseReportes
            .from(REPORTES_CONFIG.tableName)
            .insert([reporte])
            .select();

        if (error) throw error;

        showToast('✅ Reporte enviado correctamente', 'success');
        cerrarFormularioReporte();

        // Actualizar capa de reportes
        await cargarReportesEnMapa();

    } catch (error) {
        console.error('Error enviando reporte:', error);
        showToast('❌ Error al enviar el reporte: ' + error.message, 'error');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function determinarPrioridad(data) {
    // Lógica simple de priorización
    if (data.impacto_poblacion) return 'alta';
    if (data.riesgo_hidroecologico && data.riesgo_hidroecologico.toLowerCase().includes('alto')) return 'alta';
    if (data.impacto_agua && data.impacto_suelo) return 'media';
    return 'media';
}

// ============================================
// CARGAR REPORTES EN EL MAPA
// ============================================

async function cargarReportesEnMapa() {
    try {
        const { data: reportes, error } = await supabaseReportes
            .from(REPORTES_CONFIG.tableName)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        // Convertir a GeoJSON
        const geojson = {
            type: 'FeatureCollection',
            features: reportes.map(r => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [r.longitud, r.latitud]
                },
                properties: {
                    id: r.id,
                    descripcion: r.descripcion,
                    tipo_incidencia: r.tipo_incidencia,
                    estado: r.estado,
                    prioridad: r.prioridad,
                    fecha_reporte: r.fecha_reporte,
                    parroquia: r.parroquia
                }
            }))
        };

        // Agregar o actualizar source
        if (map.getSource('reportes')) {
            map.getSource('reportes').setData(geojson);
        } else {
            map.addSource('reportes', {
                type: 'geojson',
                data: geojson
            });

            // Capa de círculos
            map.addLayer({
                id: 'reportes-circles',
                type: 'circle',
                source: 'reportes',
                paint: {
                    'circle-radius': [
                        'match',
                        ['get', 'prioridad'],
                        'critica', 10,
                        'alta', 8,
                        'media', 6,
                        4
                    ],
                    'circle-color': [
                        'match',
                        ['get', 'prioridad'],
                        'critica', '#dc2626',
                        'alta', '#f59e0b',
                        'media', '#3b82f6',
                        '#6b7280'
                    ],
                    'circle-opacity': 0.8,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                }
            });

            // Click en reportes
            map.on('click', 'reportes-circles', (e) => {
                const props = e.features[0].properties;
                mostrarDetalleReporte(props.id);
            });

            map.on('mouseenter', 'reportes-circles', () => {
                map.getCanvas().style.cursor = 'pointer';
            });

            map.on('mouseleave', 'reportes-circles', () => {
                map.getCanvas().style.cursor = '';
            });
        }

        showToast(`📍 ${reportes.length} reportes cargados`, 'info');

    } catch (error) {
        console.error('Error cargando reportes:', error);
        showToast('Error cargando reportes', 'error');
    }
}

async function mostrarDetalleReporte(reporteId) {
    try {
        const { data: reporte, error } = await supabaseReportes
            .from(REPORTES_CONFIG.tableName)
            .select('*')
            .eq('id', reporteId)
            .single();

        if (error) throw error;

        // Crear HTML del detalle
        const detalleHtml = generarHTMLDetalleReporte(reporte);
        document.getElementById('details').innerHTML = detalleHtml;
        showInspector('Reporte');

    } catch (error) {
        console.error('Error cargando detalle:', error);
    }
}

function generarHTMLDetalleReporte(reporte) {
    const prioridadColor = {
        'critica': '#dc2626',
        'alta': '#f59e0b',
        'media': '#3b82f6',
        'baja': '#6b7280'
    };

    return `
        <div class="reporte-detalle">
            <div class="reporte-header" style="border-left: 4px solid ${prioridadColor[reporte.prioridad]};">
                <h4>Reporte #${reporte.id.substr(0, 8)}</h4>
                <span class="badge badge-${reporte.estado}">${reporte.estado.toUpperCase()}</span>
            </div>
            
            <div class="attr-section">
                <div class="section-title">📍 Ubicación</div>
                <div class="attr-row">
                    <span class="attr-k">Parroquia</span>
                    <span class="attr-v">${reporte.parroquia || 'N/A'}</span>
                </div>
                <div class="attr-row">
                    <span class="attr-k">Coordenadas</span>
                    <span class="attr-v">${reporte.latitud.toFixed(6)}, ${reporte.longitud.toFixed(6)}</span>
                </div>
                ${reporte.sector_referencia ? `
                <div class="attr-row">
                    <span class="attr-k">Sector</span>
                    <span class="attr-v">${reporte.sector_referencia}</span>
                </div>
                ` : ''}
            </div>
            
            <div class="attr-section">
                <div class="section-title">⚠️ Incidencia</div>
                <div class="attr-row">
                    <span class="attr-k">Tipo</span>
                    <span class="attr-v">${formatTipoIncidencia(reporte.tipo_incidencia)}</span>
                </div>
                <div class="attr-row">
                    <span class="attr-k">Prioridad</span>
                    <span class="attr-v"><strong style="color: ${prioridadColor[reporte.prioridad]}">${reporte.prioridad.toUpperCase()}</strong></span>
                </div>
                <div class="attr-row">
                    <span class="attr-k">Descripción</span>
                    <div class="attr-v long-text">${reporte.descripcion}</div>
                </div>
            </div>
            
            ${generarSeccionImpacto(reporte)}
            
            <div class="attr-section">
                <div class="section-title">📅 Información</div>
                <div class="attr-row">
                    <span class="attr-k">Fecha</span>
                    <span class="attr-v">${new Date(reporte.fecha_reporte).toLocaleDateString()}</span>
                </div>
                <div class="attr-row">
                    <span class="attr-k">Hora</span>
                    <span class="attr-v">${reporte.hora_reporte}</span>
                </div>
            </div>
            
            ${reporte.observaciones ? `
            <div class="attr-section">
                <div class="section-title">💬 Observaciones</div>
                <div class="attr-v long-text">${reporte.observaciones}</div>
            </div>
            ` : ''}
        </div>
    `;
}

function formatTipoIncidencia(tipo) {
    const tipos = {
        'riesgo_hidroecologico': 'Riesgo Hidroecológico',
        'afectacion_conservacion': 'Afectación a Conservación',
        'cambio_uso_suelo': 'Cambio de Uso de Suelo',
        'otro': 'Otro'
    };
    return tipos[tipo] || tipo;
}

function generarSeccionImpacto(reporte) {
    const impactos = [];
    if (reporte.impacto_agua) impactos.push('💧 Agua');
    if (reporte.impacto_suelo) impactos.push('🌱 Suelo');
    if (reporte.impacto_vegetacion) impactos.push('🌳 Vegetación');
    if (reporte.impacto_poblacion) impactos.push('👥 Población');
    if (reporte.impacto_no_determinado) impactos.push('❓ No determinado');

    if (impactos.length === 0) return '';

    return `
        <div class="attr-section">
            <div class="section-title">💥 Impacto Percibido</div>
            <div class="impacto-tags">
                ${impactos.map(i => `<span class="impact-tag">${i}</span>`).join('')}
            </div>
        </div>
    `;
}

// ============================================
// SUSCRIPCIÓN TIEMPO REAL
// ============================================

function iniciarSuscripcionReportes() {
    if (!supabaseReportes) {
        console.warn('Supabase no disponible para suscripción');
        return;
    }

    reportesState.subscription = supabaseReportes
        .channel('reportes_channel')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: REPORTES_CONFIG.tableName
            },
            (payload) => {
                console.log('Cambio en reportes:', payload);

                if (payload.eventType === 'INSERT') {
                    showToast('📢 Nuevo reporte recibido', 'info');
                    cargarReportesEnMapa();
                } else if (payload.eventType === 'UPDATE') {
                    cargarReportesEnMapa();
                } else if (payload.eventType === 'DELETE') {
                    cargarReportesEnMapa();
                }
            }
        )
        .subscribe();
}

// ============================================
// INICIALIZACIÓN
// ============================================

map.on('load', () => {
    // Cargar reportes existentes
    cargarReportesEnMapa();

    // Iniciar suscripción tiempo real
    iniciarSuscripcionReportes();
});

console.log('✅ Módulo de Reportes cargado');