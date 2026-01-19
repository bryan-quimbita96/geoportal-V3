const DashboardManager = {
    currentDashboard: null,
    supabase: null,

    init: function() {
        try {
            if (typeof supabase !== 'undefined') {
                this.supabase = supabase.createClient(SB_URL, SB_KEY);
                console.log('✅ Dashboard Manager inicializado con Supabase');
            } else {
                console.error('❌ Supabase no está disponible');
            }
        } catch (error) {
            console.error('Error inicializando Dashboard Manager:', error);
        }
    },

    open: async function(dashboardId) {
        const modal = document.getElementById('dashboard-modal');
        const content = document.getElementById('dashboard-content');
        
        if (!modal || !content) {
            console.error('Modal o contenido no encontrado');
            return;
        }

        content.innerHTML = '<div style="text-align: center; padding: 40px;">Cargando...</div>';
        
        try {
            switch(dashboardId) {
                case 'analisis-uso-suelo':
                    await this.renderDashboardUsoSuelo(content);
                    break;
                case 'estado-ambiental':
                    await this.renderDashboardEstadoAmbiental(content);
                    break;
                case 'planificacion-territorial':
                    await this.renderDashboardPlanificacion(content);
                    break;
                case 'riesgo-ambiental':
                    await this.renderDashboardRiesgo(content);
                    break;
                default:
                    content.innerHTML = '<p>Dashboard no encontrado</p>';
            }
        } catch (error) {
            console.error('Error cargando dashboard:', error);
            content.innerHTML = '<p>Error al cargar el dashboard: ' + error.message + '</p>';
        }
        
        modal.classList.add('show');
        this.currentDashboard = dashboardId;
    },

    renderDashboardUsoSuelo: async function(container) {
        try {
            if (!this.supabase) {
                container.innerHTML = '<p>Error: Supabase no conectado</p>';
                return;
            }

            const { data: usoSuelo, error } = await this.supabase
                .from('v_resumen_uso_suelo')
                .select('*');

            if (error) {
                console.error('Error cargando uso de suelo:', error);
                container.innerHTML = '<p>Error: ' + error.message + '</p>';
                return;
            }

            let cardsHTML = '';
            let tablaHTML = '';

            if (usoSuelo && usoSuelo.length > 0) {
                usoSuelo.forEach(item => {
                    cardsHTML += `
                        <div class="dashboard-card">
                            <div class="card-icon">🌍</div>
                            <h3 class="card-title">${item.nombre}</h3>
                            <p class="card-value">${item.porcentaje_formateado}%</p>
                            <p class="card-subtitle">${item.area_formateada} hectáreas</p>
                        </div>
                    `;

                    tablaHTML += `
                        <tr>
                            <td>${item.nombre}</td>
                            <td>${item.area_formateada}</td>
                            <td>${item.porcentaje_formateado}%</td>
                        </tr>
                    `;
                });
            }

            container.innerHTML = `
                <div class="dashboard-header">
                    <h2>🌱 Análisis de Uso de Suelo</h2>
                </div>
                <div class="dashboard-body">
                    <div class="dashboard-grid">
                        ${cardsHTML}
                    </div>
                    <div style="padding: 20px; background: white; border-radius: 10px; margin-top: 20px;">
                        <h3 style="font-size: 13px; font-weight: 700; margin: 0 0 12px 0;">Desglose Detallado</h3>
                        <table class="dashboard-table">
                            <thead>
                                <tr>
                                    <th>Categoría</th>
                                    <th>Área (ha)</th>
                                    <th>%</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tablaHTML}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            console.log('✅ Dashboard Uso de Suelo cargado:', usoSuelo);
        } catch (error) {
            console.error('Error en renderDashboardUsoSuelo:', error);
            container.innerHTML = '<p>Error: ' + error.message + '</p>';
        }
    },

    renderDashboardEstadoAmbiental: async function(container) {
        try {
            if (!this.supabase) {
                container.innerHTML = '<p>Error: Supabase no conectado</p>';
                return;
            }

            const { data: indicadores, error: errorInd } = await this.supabase
                .from('v_indicadores_salud')
                .select('*');

            const { data: parroquias, error: errorPar } = await this.supabase
                .from('v_estado_parroquias')
                .select('*');

            if (errorInd || errorPar) {
                console.error('Error:', errorInd || errorPar);
                container.innerHTML = '<p>Error: ' + (errorInd || errorPar).message + '</p>';
                return;
            }

            let cardsHTML = '';
            let tablaHTML = '';

            if (indicadores && indicadores.length > 0) {
                indicadores.forEach(ind => {
                    cardsHTML += `
                        <div class="dashboard-card">
                            <div class="card-icon">📊</div>
                            <h3 class="card-title">${ind.nombre.substring(0, 20)}...</h3>
                            <p class="card-value" style="color: #00a0e0;">${ind.valor}/${ind.valor_max}</p>
                            <p class="card-subtitle">Anterior: ${ind.valor_anterior}</p>
                            <p class="card-change ${ind.tendencia === 'positivo' ? 'positive' : 'negative'}">
                                ${ind.simbolo_tendencia} ${ind.cambio_porcentaje}%
                            </p>
                        </div>
                    `;
                });
            }

            if (parroquias && parroquias.length > 0) {
                parroquias.forEach(par => {
                    const badgeColor = par.salud_ambiental === 'Bueno' ? '#10b981' : par.salud_ambiental === 'Regular' ? '#f59e0b' : '#ef4444';
                    tablaHTML += `
                        <tr>
                            <td>${par.parroquia}</td>
                            <td><span style="color: ${badgeColor}; font-weight: 700;">${par.salud_ambiental}</span></td>
                            <td>${par.accion_recomendada}</td>
                        </tr>
                    `;
                });
            }

            container.innerHTML = `
                <div class="dashboard-header">
                    <h2>🌿 Estado Ambiental General</h2>
                </div>
                <div class="dashboard-body">
                    <div class="dashboard-grid">
                        ${cardsHTML}
                    </div>
                    <div style="padding: 20px; background: white; border-radius: 10px; margin-top: 20px;">
                        <h3 style="font-size: 13px; font-weight: 700; margin: 0 0 12px 0;">Estado por Parroquia</h3>
                        <table class="dashboard-table">
                            <thead>
                                <tr>
                                    <th>Parroquia</th>
                                    <th>Salud</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tablaHTML}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            console.log('✅ Dashboard Estado Ambiental cargado');
        } catch (error) {
            console.error('Error en renderDashboardEstadoAmbiental:', error);
            container.innerHTML = '<p>Error: ' + error.message + '</p>';
        }
    },

    renderDashboardPlanificacion: async function(container) {
        try {
            if (!this.supabase) {
                container.innerHTML = '<p>Error: Supabase no conectado</p>';
                return;
            }

            const { data: zonas, error: errorZonas } = await this.supabase
                .from('v_zonas_planificacion_resumen')
                .select('*');

            const { data: programas, error: errorProg } = await this.supabase
                .from('v_programas_resumen')
                .select('*');

            if (errorZonas || errorProg) {
                console.error('Error:', errorZonas || errorProg);
                container.innerHTML = '<p>Error: ' + (errorZonas || errorProg).message + '</p>';
                return;
            }

            let cardsHTML = '';
            let tablaHTML = '';

            if (zonas && zonas.length > 0) {
                zonas.forEach(zona => {
                    cardsHTML += `
                        <div class="dashboard-card">
                            <div class="card-icon">🗺️</div>
                            <h3 class="card-title">${zona.tipo}</h3>
                            <p class="card-value">${zona.area_hectareas}</p>
                            <p class="card-subtitle">hectáreas</p>
                        </div>
                    `;
                });
            }

            if (programas && programas.length > 0) {
                programas.forEach(prog => {
                    tablaHTML += `
                        <tr>
                            <td>${prog.nombre}</td>
                            <td>${prog.area_impl_formateada}/${Math.round(prog.area_planificada)}</td>
                            <td style="font-weight: 700;">${prog.porcentaje_avance}%</td>
                        </tr>
                    `;
                });
            }

            container.innerHTML = `
                <div class="dashboard-header">
                    <h2>🗺️ Planificación Territorial</h2>
                </div>
                <div class="dashboard-body">
                    <div class="dashboard-grid">
                        ${cardsHTML}
                    </div>
                    <div style="padding: 20px; background: white; border-radius: 10px; margin-top: 20px;">
                        <h3 style="font-size: 13px; font-weight: 700; margin: 0 0 12px 0;">Programas de Ordenamiento</h3>
                        <table class="dashboard-table">
                            <thead>
                                <tr>
                                    <th>Programa</th>
                                    <th>Avance (ha)</th>
                                    <th>%</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tablaHTML}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            console.log('✅ Dashboard Planificación cargado');
        } catch (error) {
            console.error('Error en renderDashboardPlanificacion:', error);
            container.innerHTML = '<p>Error: ' + error.message + '</p>';
        }
    },

    renderDashboardRiesgo: async function(container) {
        try {
            if (!this.supabase) {
                container.innerHTML = '<p>Error: Supabase no conectado</p>';
                return;
            }

            const { data: riesgos, error } = await this.supabase
                .from('v_resumen_riesgos')
                .select('*');

            if (error) {
                console.error('Error cargando riesgos:', error);
                container.innerHTML = '<p>Error: ' + error.message + '</p>';
                return;
            }

            let cardsHTML = '';
            let tablaHTML = '';

            const tiposRiesgo = {};
            const colores = { 'Bajo': '#10b981', 'Medio': '#f59e0b', 'Alto': '#ef4444' };

            if (riesgos && riesgos.length > 0) {
                riesgos.forEach(riesgo => {
                    if (!tiposRiesgo[riesgo.tipo_riesgo]) {
                        tiposRiesgo[riesgo.tipo_riesgo] = {
                            maxNivel: riesgo.nivel_riesgo,
                            count: 0,
                            icon: '⚠️'
                        };
                    }
                    tiposRiesgo[riesgo.tipo_riesgo].count++;
                    tiposRiesgo[riesgo.tipo_riesgo].maxNivel = Math.max(tiposRiesgo[riesgo.tipo_riesgo].maxNivel, riesgo.nivel_riesgo);

                    const color = colores[riesgo.nivel_clasificado] || '#f59e0b';
                    tablaHTML += `
                        <tr>
                            <td>${riesgo.zona}</td>
                            <td>${riesgo.tipo_riesgo}</td>
                            <td style="color: ${color}; font-weight: 700;">${riesgo.nivel_clasificado}</td>
                            <td>${riesgo.poblacion_expuesta}</td>
                        </tr>
                    `;
                });

                Object.entries(tiposRiesgo).forEach(([tipo, data]) => {
                    const nivelClassif = data.maxNivel <= 3 ? 'Bajo' : data.maxNivel <= 6 ? 'Medio' : 'Alto';
                    cardsHTML += `
                        <div class="dashboard-card">
                            <div class="card-icon">${data.icon}</div>
                            <h3 class="card-title">${tipo}</h3>
                            <p class="card-value">${data.maxNivel}/10</p>
                            <p class="card-subtitle">${data.count} zonas</p>
                        </div>
                    `;
                });
            }

            container.innerHTML = `
                <div class="dashboard-header">
                    <h2>⚠️ Análisis de Riesgo Ambiental</h2>
                </div>
                <div class="dashboard-body">
                    <div class="dashboard-grid">
                        ${cardsHTML}
                    </div>
                    <div style="padding: 20px; background: white; border-radius: 10px; margin-top: 20px;">
                        <h3 style="font-size: 13px; font-weight: 700; margin: 0 0 12px 0;">Matriz de Riesgo</h3>
                        <table class="dashboard-table">
                            <thead>
                                <tr>
                                    <th>Zona</th>
                                    <th>Riesgo</th>
                                    <th>Nivel</th>
                                    <th>Población</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tablaHTML}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            console.log('✅ Dashboard Riesgos cargado');
        } catch (error) {
            console.error('Error en renderDashboardRiesgo:', error);
            container.innerHTML = '<p>Error: ' + error.message + '</p>';
        }
    }
};

window.openDashboard = function(dashboardId) {
    DashboardManager.open(dashboardId);
};

window.closeDashboard = function() {
    const modal = document.getElementById('dashboard-modal');
    if (modal) modal.classList.remove('show');
};

// Inicializar cuando el documento esté listo
document.addEventListener('DOMContentLoaded', function() {
    console.log('📊 Inicializando Dashboard Manager...');
    DashboardManager.init();

    const tabs = document.querySelectorAll('.sidebar-tab');
    const contents = document.querySelectorAll('.sidebar-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const activeContent = document.getElementById(`${tabName}-tab`);
            if (activeContent) activeContent.classList.add('active');
        });
    });

    console.log('✅ Dashboards sincronizados con Supabase');
});
