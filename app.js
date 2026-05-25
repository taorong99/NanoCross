// app.js - 核心应用入口：负责组装各个模块，并挂载 Vue 实例
const { createApp, ref, computed, watch, onMounted, onUnmounted, nextTick } = Vue;

const App = {
    setup() {
        const store = useStore();
        const history = useHistory(store.processSteps, store.variables, store.flowDiagramSettings);

        const variablesMinimized = ref(false);
        const showExportMenu = ref(false);
        const showLegendSettingsModal = ref(false);
        const showFlowDiagramSettingsModal = ref(false);
        const legendModalPosition = ref({ left: '50px', top: '100px' });
        const FLOW_DIAGRAM_MODAL_WIDTH = 500;
        const flowDiagramModalPosition = ref({ left: '56px', top: '80px' });

        const showPreviewModal = ref(false);
        const previewImageUrl = ref('');
        const previewFileName = ref('');
        const mainSvgRef = ref(null);
        const hoverLayerIndex = ref(-1);
        const hoverPatternIndex = ref(-1);
        const focusedPatternIndex = ref(-1);
        const flashingPatternIndex = ref(-1);
        const hoverCardPatternIndex = ref(-1);

        const triggerResize = ref(0);
        const layersWidth = ref(250);
        const propsWidth = ref(300);
        let activeResizer = null;
        const flowDiagramBoardRef = ref(null);
        const flowDiagramBoardWidth = ref(0);
        const FLOW_DIAGRAM_MIN_CARD_WIDTH = 100;
        const FLOW_DIAGRAM_MIN_CARD_HEIGHT = 100;

        const editingFlowDiagramStepId = ref(null);
        const flowDiagramDraftCaption = ref('');
        const flowDiagramLayout = computed(() => {
            const requestedItemsPerRow = Math.max(1, store.flowDiagramSettings.value.itemsPerRow || 1);
            const boardWidth = flowDiagramBoardWidth.value || 1200;
            const gapX = Math.max(0, Number(store.flowDiagramSettings.value.gapX) || 0);
            const maxItemsPerRow = Math.max(
                1,
                Math.floor((boardWidth + gapX) / (FLOW_DIAGRAM_MIN_CARD_WIDTH + gapX))
            );
            const effectiveItemsPerRow = Math.min(requestedItemsPerRow, maxItemsPerRow);
            const totalGap = Math.max(0, effectiveItemsPerRow - 1) * gapX;
            const width = Math.max(
                FLOW_DIAGRAM_MIN_CARD_WIDTH,
                Math.floor((boardWidth - totalGap) / effectiveItemsPerRow)
            );
            const height = Math.max(FLOW_DIAGRAM_MIN_CARD_HEIGHT, Math.round(width * 0.72));
            return {
                requestedItemsPerRow,
                effectiveItemsPerRow,
                width,
                height
            };
        });
        const flowDiagramViewport = computed(() => ({
            width: flowDiagramLayout.value.width,
            height: flowDiagramLayout.value.height
        }));

        const flowDiagramPipeline = useFlowDiagramPipeline({
            processSteps: store.processSteps,
            parsedSteps: store.parsedSteps,
            flowDiagramSettings: store.flowDiagramSettings,
            viewMode: store.viewMode,
            mainEngineResult: store.engineResult,
            targetViewport: flowDiagramViewport
        });

        const openLegendSettings = () => {
            const winWidth = window.innerWidth || document.documentElement.clientWidth || 1000;
            legendModalPosition.value.left = Math.max(0, (winWidth - 500) / 2) + 'px';
            legendModalPosition.value.top = '100px';
            showLegendSettingsModal.value = true;
        };

        const openFlowDiagramSettings = () => {
            const propertiesPanelRight = layersWidth.value + 6 + propsWidth.value;
            const left = Math.max(20, propertiesPanelRight - FLOW_DIAGRAM_MODAL_WIDTH);
            flowDiagramModalPosition.value.left = left + 'px';
            flowDiagramModalPosition.value.top = '80px';
            showFlowDiagramSettingsModal.value = true;
        };

        let dragInfo = { isDragging: false, startX: 0, startY: 0, initialLeft: 0, initialTop: 0 };
        const startDragLegendSettings = (e) => {
            dragInfo.isDragging = true;
            dragInfo.startX = e.clientX;
            dragInfo.startY = e.clientY;
            dragInfo.initialLeft = parseInt(legendModalPosition.value.left, 10) || 0;
            dragInfo.initialTop = parseInt(legendModalPosition.value.top, 10) || 0;

            document.addEventListener('mousemove', onDragLegendSettings);
            document.addEventListener('mouseup', endDragLegendSettings);
        };
        const onDragLegendSettings = (e) => {
            if (!dragInfo.isDragging) return;
            const dx = e.clientX - dragInfo.startX;
            const dy = e.clientY - dragInfo.startY;
            legendModalPosition.value.left = (dragInfo.initialLeft + dx) + 'px';
            legendModalPosition.value.top = (dragInfo.initialTop + dy) + 'px';
        };
        const endDragLegendSettings = () => {
            dragInfo.isDragging = false;
            document.removeEventListener('mousemove', onDragLegendSettings);
            document.removeEventListener('mouseup', endDragLegendSettings);
        };

        let flowDragInfo = { isDragging: false, startX: 0, startY: 0, initialLeft: 0, initialTop: 0 };
        const startDragFlowDiagramSettings = (e) => {
            flowDragInfo.isDragging = true;
            flowDragInfo.startX = e.clientX;
            flowDragInfo.startY = e.clientY;
            flowDragInfo.initialLeft = parseInt(flowDiagramModalPosition.value.left, 10) || 0;
            flowDragInfo.initialTop = parseInt(flowDiagramModalPosition.value.top, 10) || 0;

            document.addEventListener('mousemove', onDragFlowDiagramSettings);
            document.addEventListener('mouseup', endDragFlowDiagramSettings);
        };
        const onDragFlowDiagramSettings = (e) => {
            if (!flowDragInfo.isDragging) return;
            const dx = e.clientX - flowDragInfo.startX;
            const dy = e.clientY - flowDragInfo.startY;
            flowDiagramModalPosition.value.left = (flowDragInfo.initialLeft + dx) + 'px';
            flowDiagramModalPosition.value.top = (flowDragInfo.initialTop + dy) + 'px';
        };
        const endDragFlowDiagramSettings = () => {
            flowDragInfo.isDragging = false;
            document.removeEventListener('mousemove', onDragFlowDiagramSettings);
            document.removeEventListener('mouseup', endDragFlowDiagramSettings);
        };

        const stepMetaMap = computed(() => {
            const map = new Map();
            store.processSteps.value.forEach((step, index) => {
                map.set(step.id, { step, index });
            });
            return map;
        });

        const visibleFlowDiagramSteps = computed(() => {
            const hiddenIds = new Set(store.flowDiagramSettings.value.hiddenStepIds || []);
            return store.processSteps.value
                .map((step, index) => ({ step, index }))
                .filter(({ step }) => !hiddenIds.has(step.id));
        });

        const flowDiagramCards = computed(() => {
            return flowDiagramPipeline.visibleFlowDiagramCards.value
                .map(card => {
                    const meta = stepMetaMap.value.get(card.stepId);
                    if (!meta) return null;
                    return {
                        ...card,
                        step: meta.step,
                        index: meta.index,
                        caption: meta.step.flowDiagramCaption || meta.step.name || ''
                    };
                })
                .filter(Boolean);
        });

        const hiddenFlowDiagramSteps = computed(() => {
            const hiddenIds = store.flowDiagramSettings.value.hiddenStepIds || [];
            return hiddenIds
                .map(id => stepMetaMap.value.get(id))
                .filter(Boolean)
                .map(meta => ({ step: meta.step, index: meta.index }));
        });

        const flowDiagramGridStyle = computed(() => ({
            display: 'grid',
            gridTemplateColumns: `repeat(${flowDiagramLayout.value.effectiveItemsPerRow}, minmax(${FLOW_DIAGRAM_MIN_CARD_WIDTH}px, 1fr))`,
            columnGap: `${store.flowDiagramSettings.value.gapX}px`,
            rowGap: `${store.flowDiagramSettings.value.gapY}px`
        }));

        const flowDiagramBoardStyle = computed(() => ({
            background: store.flowDiagramSettings.value.boardBackground,
            padding: `${store.flowDiagramSettings.value.boardPadding}px`,
            minHeight: '100%',
            boxSizing: 'border-box',
            borderRadius: '8px'
        }));

        const updateFlowDiagramBoardMetrics = () => {
            if (!flowDiagramBoardRef.value) return;
            const boardPadding = Number(store.flowDiagramSettings.value.boardPadding) || 0;
            const boardElement = flowDiagramBoardRef.value.$el || flowDiagramBoardRef.value;
            const rawWidth = boardElement && boardElement.clientWidth ? boardElement.clientWidth : 0;
            flowDiagramBoardWidth.value = Math.max(0, rawWidth - boardPadding * 2);
        };

        const flowDiagramSummaryText = computed(() => {
            if (flowDiagramPipeline.isGeneratingFlowDiagram.value) return '生成中...';
            if (flowDiagramPipeline.flowDiagramGenerationError.value) return '生成失败';
            if (flowDiagramPipeline.isFlowDiagramDirty.value) return '需要刷新';
            return '已同步';
        });

        const toggleLegendLayer = (id) => {
            const arr = store.legendSettings.value.hiddenLegendIds;
            const idx = arr.indexOf(id);
            if (idx === -1) arr.push(id);
            else arr.splice(idx, 1);
        };

        const toggleFlowDiagramStepHidden = (stepId) => {
            const arr = store.flowDiagramSettings.value.hiddenStepIds;
            const idx = arr.indexOf(stepId);
            if (idx === -1) arr.push(stepId);
            else arr.splice(idx, 1);
        };

        const showFlowDiagramStep = (stepId) => {
            store.flowDiagramSettings.value.hiddenStepIds = store.flowDiagramSettings.value.hiddenStepIds.filter(id => id !== stepId);
        };

        const refreshFlowDiagram = async () => {
            await flowDiagramPipeline.generateFlowDiagram();
        };

        const startEditingFlowDiagramCaption = (stepId) => {
            const meta = stepMetaMap.value.get(stepId);
            if (!meta) return;
            editingFlowDiagramStepId.value = stepId;
            flowDiagramDraftCaption.value = meta.step.flowDiagramCaption || meta.step.name || '';
            nextTick(() => {
                const input = document.querySelector(`[data-flow-caption-input="${stepId}"]`);
                if (input) {
                    input.focus();
                    input.select();
                }
            });
        };

        const commitFlowDiagramCaption = () => {
            const stepId = editingFlowDiagramStepId.value;
            if (stepId == null) return;
            const meta = stepMetaMap.value.get(stepId);
            if (meta) {
                const nextValue = flowDiagramDraftCaption.value.trim();
                meta.step.flowDiagramCaption = nextValue && nextValue !== meta.step.name ? nextValue : '';
            }
            editingFlowDiagramStepId.value = null;
        };

        const cancelFlowDiagramCaption = () => {
            editingFlowDiagramStepId.value = null;
            flowDiagramDraftCaption.value = '';
        };

        const handleFlowDiagramCaptionKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitFlowDiagramCaption();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelFlowDiagramCaption();
            }
        };

        const getFlowDiagramCaptionAnchor = () => {
            if (store.flowDiagramSettings.value.textAlign === 'left') return 'start';
            if (store.flowDiagramSettings.value.textAlign === 'right') return 'end';
            return 'middle';
        };

        const getFlowDiagramCaptionX = () => {
            if (store.flowDiagramSettings.value.textAlign === 'left') return 18;
            if (store.flowDiagramSettings.value.textAlign === 'right') return 282;
            return 150;
        };

        const getFlowDiagramCaptionPreview = (step) => {
            if (!step) return '';
            return step.flowDiagramCaption || step.name || '';
        };

        const legendData = computed(() => {
            const result = store.engineResult.value;
            const settings = store.legendSettings.value;

            let subL = result.subLeft !== undefined ? result.subLeft : -400;
            let subR = result.subRight !== undefined ? result.subRight : 400;

            let totalWidth = subR - subL;
            let startX = subL;

            if (settings.widthMode === 'custom') {
                totalWidth = settings.customWidth || 800;
                startX = (subL + subR) / 2 - totalWidth / 2;
            }

            const items = store.processSteps.value.filter((s, idx) =>
                (idx === 0 || s.type === 'deposit') && !settings.hiddenLegendIds.includes(s.id)
            );

            const marginTop = settings.marginTop !== undefined ? settings.marginTop : 40;
            const itemsPerRow = settings.itemsPerRow || 4;
            const iconSize = settings.iconSize || 20;

            const startY = 500 + marginTop;
            const rowHeight = Math.max(40, iconSize + 10);
            const fontSize = settings.fontSize || 14;

            let elements = [];

            if (settings.showLegend !== false) {
                for (let i = 0; i < items.length; i++) {
                    let item = items[i];
                    let row = Math.floor(i / itemsPerRow);
                    let col = i % itemsPerRow;
                    const cellWidth = totalWidth / itemsPerRow;
                    let currX = startX + col * cellWidth;
                    let currY = startY + row * rowHeight;

                    let text = settings.textSource === 'material'
                        ? (item.material || 'Unnamed')
                        : (item.name || 'Unnamed');

                    elements.push({
                        id: item.id,
                        x: currX,
                        y: currY,
                        color: item.color,
                        text: text
                    });
                }
            }

            const totalRows = Math.ceil(items.length / itemsPerRow);
            const contentHeight = settings.showLegend !== false ? totalRows * rowHeight : 20;

            return {
                elements: elements,
                boxX: startX,
                boxY: startY - 10,
                boxW: totalWidth,
                boxH: contentHeight + 10,
                iconX: startX + totalWidth - 25,
                iconY: startY - 5,
                fontSize: fontSize
            };
        });

        const canvasProps = useCanvas(
            store.engineResult,
            triggerResize,
            store.parsedSteps,
            store.activeLayerIndex,
            hoverLayerIndex,
            hoverPatternIndex,
            focusedPatternIndex,
            flashingPatternIndex,
            hoverCardPatternIndex
        );

        const simulationSignature = computed(() => JSON.stringify({
            steps: store.processSteps.value.map(step => ({
                id: step.id,
                type: step.type,
                thickness: step.thickness,
                angle: step.angle,
                visible: step.visible,
                patterns: (step.patterns || []).map(pattern => ({
                    x: pattern.x,
                    w: pattern.w
                }))
            })),
            variables: store.variables.value
        }));

        const updateSimulation = () => {
            if (window.calculateProfiles) {
                const parsed = store.getParsedSteps();
                const currentResult = window.calculateProfiles(parsed);
                const fullParsed = parsed.map(s => ({ ...s, visible: true }));
                const fullResult = window.calculateProfiles(fullParsed);
                currentResult.fullMaxH = fullResult.maxH;
                store.engineResult.value = currentResult;
            }
        };

        watch(simulationSignature, () => {
            updateSimulation();
            if (!history.getIsUndoing()) {
                history.pushHistory();
            }
        });
        watch(() => JSON.stringify(store.processSteps.value.map(step => ({
            id: step.id,
            name: step.name,
            material: step.material,
            flowDiagramCaption: step.flowDiagramCaption,
            visible: step.visible
        }))), () => {
            if (!history.getIsUndoing()) {
                history.pushHistory();
            }
        });
        watch(() => JSON.stringify(store.variables.value), () => {
            if (!history.getIsUndoing()) {
                history.pushHistory();
            }
        });
        watch(store.flowDiagramSettings, () => {
            if (!history.getIsUndoing()) {
                history.pushHistory();
            }
        }, { deep: true });

        watch(store.activeLayerIndex, () => {
            focusedPatternIndex.value = -1;
            flashingPatternIndex.value = -1;
        });

        watch(() => store.flowDiagramSettings.value.autoRefresh, (enabled) => {
            if (enabled && store.viewMode.value === 'flowDiagram' && flowDiagramPipeline.isFlowDiagramDirty.value) {
                refreshFlowDiagram();
            }
        });

        watch([
            () => store.viewMode.value,
            () => flowDiagramLayout.value.effectiveItemsPerRow,
            () => store.flowDiagramSettings.value.gapX,
            () => store.flowDiagramSettings.value.boardPadding,
            triggerResize
        ], () => {
            if (store.viewMode.value !== 'flowDiagram') return;
            nextTick(() => {
                updateFlowDiagramBoardMetrics();
                flowDiagramPipeline.rebuildFlowDiagramLayout();
            });
        });

        const globalMouseUp = (e) => {
            endResize();
            if (canvasProps.endPan) canvasProps.endPan(e);
        };
        const globalMouseMove = (e) => {
            doResize(e);
            if (canvasProps.doPan) canvasProps.doPan(e);
        };
        const globalWindowResize = () => {
            triggerResize.value++;
            if (store.viewMode.value === 'flowDiagram') {
                nextTick(() => {
                    updateFlowDiagramBoardMetrics();
                    flowDiagramPipeline.rebuildFlowDiagramLayout();
                });
            }
        };

        onMounted(() => {
            updateSimulation();
            history.pushHistory();
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('mouseup', globalMouseUp);
            window.addEventListener('mousemove', globalMouseMove);
            window.addEventListener('resize', globalWindowResize);
            nextTick(() => {
                updateFlowDiagramBoardMetrics();
            });
        });

        onUnmounted(() => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mouseup', globalMouseUp);
            window.removeEventListener('mousemove', globalMouseMove);
            window.removeEventListener('resize', globalWindowResize);
        });

        const handleKeyDown = (e) => {
            if ((e.target.tagName === 'INPUT' && e.target.type !== 'range') || e.target.tagName === 'TEXTAREA') return;
            if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); history.undo(); return; }
            if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); history.redo(); return; }
            if (store.viewMode.value === 'main' && canvasProps.handleKeyDown) {
                canvasProps.handleKeyDown(e);
            }
        };

        const onCanvasPatternClick = (layerIdx, pIdx) => {
            store.activeLayerIndex.value = layerIdx;
            setTimeout(() => {
                flashingPatternIndex.value = pIdx;
                focusedPatternIndex.value = -1;
            }, 10);
        };

        const startResize = (e, panel) => {
            activeResizer = panel;
            document.body.style.cursor = 'col-resize';
        };
        const doResize = (e) => {
            if (!activeResizer) return;
            if (activeResizer === 'layers') {
                layersWidth.value = Math.max(150, Math.min(e.clientX, 500));
            } else if (activeResizer === 'props') {
                propsWidth.value = Math.max(200, Math.min(e.clientX - (layersWidth.value + 6), 600));
            }
        };
        const endResize = () => {
            activeResizer = null;
            document.body.style.cursor = 'default';
        };

        const onDragStart = (e, index) => {
            if (index === 0) return;
            e.dataTransfer.setData('stepIndex', index);
        };
        const onDrop = (e, index) => {
            if (index === 0) return;
            const dragIndex = parseInt(e.dataTransfer.getData('stepIndex'), 10);
            if (dragIndex) {
                const item = store.processSteps.value.splice(dragIndex, 1)[0];
                store.processSteps.value.splice(index, 0, item);
            }
        };

        const exportFile = (format) => {
            if (!mainSvgRef.value) return;

            const clonedSvg = mainSvgRef.value.cloneNode(true);
            const ignores = clonedSvg.querySelectorAll('.export-ignore, .flashing-path');
            ignores.forEach(el => el.remove());

            clonedSvg.style.position = '';
            clonedSvg.style.top = '';
            clonedSvg.style.left = '';
            clonedSvg.removeAttribute('width');
            clonedSvg.removeAttribute('height');

            let resObj = store.engineResult.value;
            if (resObj && typeof resObj.subLeft === 'number') {
                const margin = 20;
                const tightX = resObj.subLeft - margin;
                const tightWidth = (resObj.subRight - resObj.subLeft) + margin * 2;
                const trueMaxH = resObj.fullMaxH !== undefined ? resObj.fullMaxH : resObj.maxH;
                const tightY = 500 - trueMaxH - margin;
                const maxY = legendData.value ? legendData.value.boxY + legendData.value.boxH + margin : 500 + 50 + margin;
                const tightHeight = Math.max(trueMaxH + margin * 2 + 50, maxY - tightY);

                clonedSvg.setAttribute('viewBox', `${tightX} ${tightY} ${tightWidth} ${tightHeight}`);
                clonedSvg.setAttribute('width', `${tightWidth}px`);
                clonedSvg.setAttribute('height', `${tightHeight}px`);
            }

            const serializer = new XMLSerializer();
            let svgString = serializer.serializeToString(clonedSvg);

            if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
                svgString = svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
            }

            const fileName = (store.projectName.value || 'NanoCross_Project') + '-export';

            if (format === 'svg') {
                const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${fileName}.svg`;
                a.click();
                URL.revokeObjectURL(url);
            } else if (format === 'png') {
                const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);

                const img = new Image();
                img.onload = () => {
                    const currentViewBox = clonedSvg.getAttribute('viewBox');
                    let targetW = 1920;
                    let targetH = 1080;
                    if (currentViewBox) {
                        const [, , vbW, vbH] = currentViewBox.split(' ').map(Number);
                        if (vbW && vbH) {
                            targetH = (vbH / vbW) * targetW;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = targetW;
                    canvas.height = targetH;
                    const ctx = canvas.getContext('2d');

                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, targetW, targetH);
                    ctx.drawImage(img, 0, 0, targetW, targetH);

                    previewImageUrl.value = canvas.toDataURL('image/png');
                    previewFileName.value = `${fileName}.png`;
                    showPreviewModal.value = true;
                    URL.revokeObjectURL(url);
                };
                img.src = url;
            }
        };

        const confirmDownloadPng = () => {
            if (!previewImageUrl.value) return;
            const a = document.createElement('a');
            a.href = previewImageUrl.value;
            a.download = previewFileName.value;
            a.click();
            showPreviewModal.value = false;
        };

        const cancelDownloadPng = () => {
            showPreviewModal.value = false;
            previewImageUrl.value = '';
        };

        const applyData = (data) => {
            if (data.projectName) {
                store.projectName.value = data.projectName;
            }
            if (data.variables && Array.isArray(data.variables)) {
                store.variables.value = data.variables;
            }
            if (data.processSteps && Array.isArray(data.processSteps)) {
                store.processSteps.value = data.processSteps.map(store.normalizeProcessStep);
                store.activeLayerIndex.value = Math.max(0, data.processSteps.length - 1);
                if (history && history.pushHistory) {
                    setTimeout(history.pushHistory, 100);
                }
            } else {
                alert('获取到的文件格式无效（缺少 processSteps 数据）');
            }
            if (data.legendSettings) {
                Object.assign(store.legendSettings.value, data.legendSettings);
            }
            store.flowDiagramSettings.value = store.normalizeFlowDiagramSettings(data.flowDiagramSettings);
        };

        const loadFile = async () => {
            let useLocal = false;
            try {
                const res = await fetch('/api/designs');
                if (!res.ok) {
                    useLocal = true;
                } else {
                    const projects = await res.json();
                    if (projects.length === 0) {
                        alert('服务器上还没有保存任何项目。');
                        return;
                    }

                    const listText = projects.join('\n- ');
                    const inputName = prompt(`请输入要加载的项目名称 (不带.json):\n\n当前服务器包含以下项目:\n- ${listText}`);
                    if (!inputName) return;

                    const loadRes = await fetch(`/api/load/${encodeURIComponent(inputName)}`);
                    if (!loadRes.ok) throw new Error(`项目 "${inputName}" 不存在或读取失败`);

                    const data = await loadRes.json();
                    applyData(data);
                }
            } catch (err) {
                useLocal = true;
            }

            if (useLocal) {
                alert('未检测到后端环境连接。\n即将切换至【本地文件读取模式】加载文件...');
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        try {
                            const data = JSON.parse(re.target.result);
                            applyData(data);
                        } catch (err) {
                            alert('无效的 JSON 文件格式');
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            }
        };

        const saveFile = async () => {
            let nameToSave = store.projectName.value;
            if (!nameToSave || nameToSave.trim() === '') {
                const name = prompt('请输入项目名称：');
                if (name && name.trim() !== '') {
                    nameToSave = name.trim();
                    store.projectName.value = nameToSave;
                } else {
                    return;
                }
            }

            const saveData = {
                projectName: nameToSave,
                variables: store.variables.value,
                processSteps: store.processSteps.value,
                legendSettings: store.legendSettings.value,
                flowDiagramSettings: store.flowDiagramSettings.value
            };

            let useLocal = false;
            try {
                const response = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(saveData)
                });

                if (response.ok) {
                    alert(`保存成功！数据已后台写入 /designs/${nameToSave}.json`);
                } else {
                    useLocal = true;
                }
            } catch (err) {
                useLocal = true;
            }

            if (useLocal) {
                alert('未检测到后端环境连接。\n即将切换至【浏览器下载模式】保存当前设计...');
                const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(saveData, null, 4));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute('href', dataStr);
                downloadAnchorNode.setAttribute('download', `${nameToSave}.json`);
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            }
        };

        return {
            ...store,
            ...canvasProps,
            ...flowDiagramPipeline,
            legendData,
            visibleFlowDiagramSteps,
            flowDiagramCards,
            hiddenFlowDiagramSteps,
            flowDiagramGridStyle,
            flowDiagramBoardStyle,
            flowDiagramSummaryText,
            flowDiagramViewport,
            flowDiagramBoardRef,
            editingFlowDiagramStepId,
            flowDiagramDraftCaption,
            history,
            loadFile,
            saveFile,
            exportFile,
            refreshFlowDiagram,
            toggleLegendLayer,
            toggleFlowDiagramStepHidden,
            showFlowDiagramStep,
            startEditingFlowDiagramCaption,
            commitFlowDiagramCaption,
            cancelFlowDiagramCaption,
            handleFlowDiagramCaptionKeydown,
            getFlowDiagramCaptionAnchor,
            getFlowDiagramCaptionX,
            getFlowDiagramCaptionPreview,
            showExportMenu,
            showLegendSettingsModal,
            showFlowDiagramSettingsModal,
            showPreviewModal,
            previewImageUrl,
            confirmDownloadPng,
            cancelDownloadPng,
            mainSvgRef,
            legendModalPosition,
            flowDiagramModalPosition,
            openLegendSettings,
            openFlowDiagramSettings,
            startDragLegendSettings,
            startDragFlowDiagramSettings,
            undo: history.undo,
            redo: history.redo,
            canUndo: history.canUndo,
            canRedo: history.canRedo,
            variablesMinimized,
            hoverLayerIndex,
            hoverPatternIndex,
            focusedPatternIndex,
            flashingPatternIndex,
            hoverCardPatternIndex,
            layersWidth,
            propsWidth,
            startResize,
            triggerResize,
            onDragStart,
            onDrop,
            onCanvasPatternClick
        };
    }
};

const app = createApp(App);
if (typeof registerComponents === 'function') {
    registerComponents(app);
}
app.mount('#app');
