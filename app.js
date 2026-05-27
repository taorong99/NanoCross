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
        const showFlowDiagramLegendSettingsModal = ref(false);
        const legendModalPosition = ref({ left: '50px', top: '100px' });
        const FLOW_DIAGRAM_MODAL_WIDTH = 500;
        const FLOW_DIAGRAM_LEGEND_MODAL_WIDTH = 420;
        const flowDiagramModalPosition = ref({ left: '56px', top: '80px' });
        const flowDiagramLegendModalPosition = ref({ left: '56px', top: '116px' });

        const showPreviewModal = ref(false);
        const previewImageUrl = ref('');
        const previewFileName = ref('');
        const pendingPreviewDownload = ref(null);
        const showFlowDiagramExportQualityModal = ref(false);
        const pendingFlowDiagramExportFormat = ref('');
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
        let simulationFrameHandle = null;

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
        const stepMetaMap = computed(() => {
            const map = new Map();
            store.processSteps.value.forEach((step, index) => {
                map.set(step.id, { step, index });
            });
            return map;
        });

        const flowDiagramPipeline = useFlowDiagramPipeline({
            processSteps: store.processSteps,
            parsedSteps: store.parsedSteps,
            flowDiagramSettings: store.flowDiagramSettings,
            viewMode: store.viewMode,
            mainEngineResult: store.engineResult,
            stepMetaMap,
            layoutMeta: flowDiagramLayout
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

        const openFlowDiagramLegendSettings = () => {
            const propertiesPanelRight = layersWidth.value + 6 + propsWidth.value;
            const left = Math.max(20, propertiesPanelRight - FLOW_DIAGRAM_LEGEND_MODAL_WIDTH);
            flowDiagramLegendModalPosition.value.left = left + 'px';
            flowDiagramLegendModalPosition.value.top = '116px';
            showFlowDiagramLegendSettingsModal.value = true;
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

        let flowLegendDragInfo = { isDragging: false, startX: 0, startY: 0, initialLeft: 0, initialTop: 0 };
        const startDragFlowDiagramLegendSettings = (e) => {
            flowLegendDragInfo.isDragging = true;
            flowLegendDragInfo.startX = e.clientX;
            flowLegendDragInfo.startY = e.clientY;
            flowLegendDragInfo.initialLeft = parseInt(flowDiagramLegendModalPosition.value.left, 10) || 0;
            flowLegendDragInfo.initialTop = parseInt(flowDiagramLegendModalPosition.value.top, 10) || 0;

            document.addEventListener('mousemove', onDragFlowDiagramLegendSettings);
            document.addEventListener('mouseup', endDragFlowDiagramLegendSettings);
        };
        const onDragFlowDiagramLegendSettings = (e) => {
            if (!flowLegendDragInfo.isDragging) return;
            const dx = e.clientX - flowLegendDragInfo.startX;
            const dy = e.clientY - flowLegendDragInfo.startY;
            flowDiagramLegendModalPosition.value.left = (flowLegendDragInfo.initialLeft + dx) + 'px';
            flowDiagramLegendModalPosition.value.top = (flowLegendDragInfo.initialTop + dy) + 'px';
        };
        const endDragFlowDiagramLegendSettings = () => {
            flowLegendDragInfo.isDragging = false;
            document.removeEventListener('mousemove', onDragFlowDiagramLegendSettings);
            document.removeEventListener('mouseup', endDragFlowDiagramLegendSettings);
        };

        const flowDiagramCards = computed(() => flowDiagramPipeline.items.value);
        const hiddenFlowDiagramSteps = computed(() => flowDiagramPipeline.hiddenItems.value);

        const getFlowDiagramCardChrome = () => (
            ['full', 'minimal', 'none'].includes(store.flowDiagramSettings.value.cardChrome)
                ? store.flowDiagramSettings.value.cardChrome
                : 'full'
        );

        const getFlowDiagramCardMetrics = (options = {}) => {
            const includeEditorChrome = options.includeEditorChrome !== false;
            const cardChrome = getFlowDiagramCardChrome();
            const borderWidth = cardChrome === 'none' ? 0 : 1;
            const headerHeight = includeEditorChrome && cardChrome === 'full' ? 45 : 0;
            const gapY = Number(store.flowDiagramSettings.value.gapY) || 0;
            const captionGapRaw = Number(store.flowDiagramSettings.value.captionGap);
            const captionGap = Number.isFinite(captionGapRaw) ? Math.min(80, Math.max(-20, captionGapRaw)) : 12;
            const captionHeight = store.flowDiagramSettings.value.showCaption ? Math.max(22, 36 + captionGap) : 0;
            const captionDividerHeight = store.flowDiagramSettings.value.showCaption && cardChrome === 'full' ? 1 : 0;
            const captionBlockHeight = captionHeight + captionDividerHeight;
            const bodyHeight = flowDiagramLayout.value.height;
            const minVisibleBodyHeight = Math.min(40, Math.max(1, bodyHeight));
            // gapY 这里有两套语义：
            // >= 0：表示两行卡片边界之间的真实距离，和横向间距语义一致。
            // < 0：表示统一压缩每张卡片的可视窗口。此时不是让各行真实重叠，
            //      而是把每张截面图 body 的顶部统一裁掉 -gapY，让第一行和后续行
            //      露出的截面图内容高度一致，同时保留完整卡片边框。
            const bodyClipTop = gapY < 0
                ? Math.min(-gapY, Math.max(0, bodyHeight - minVisibleBodyHeight))
                : 0;
            const bodyVisibleHeight = Math.max(minVisibleBodyHeight, bodyHeight - bodyClipTop);
            return {
                borderWidth,
                headerHeight,
                bodyHeight,
                bodyClipTop,
                bodyVisibleHeight,
                captionHeight,
                captionBlockHeight,
                height: borderWidth * 2 + headerHeight + bodyVisibleHeight + captionBlockHeight,
                width: Math.max(1, flowDiagramLayout.value.width)
            };
        };

        const getFlowDiagramLayoutFrame = (cards = flowDiagramCards.value || [], options = {}) => {
            const boardPadding = Number(store.flowDiagramSettings.value.boardPadding) || 0;
            const gapX = Math.max(0, Number(store.flowDiagramSettings.value.gapX) || 0);
            const gapY = Number(store.flowDiagramSettings.value.gapY) || 0;
            const metrics = getFlowDiagramCardMetrics(options);
            const itemsPerRow = Math.max(1, flowDiagramLayout.value.effectiveItemsPerRow || 1);
            const totalRows = cards.length ? Math.max(...cards.map(card => (card.rowIndex || 0))) + 1 : 0;
            const rowPitch = Math.max(1, metrics.height + Math.max(0, gapY));
            const boardWidth = itemsPerRow * metrics.width + Math.max(0, itemsPerRow - 1) * gapX + boardPadding * 2;
            const contentHeight = totalRows > 0
                ? metrics.height + Math.max(0, totalRows - 1) * rowPitch
                : 0;
            const boardHeight = contentHeight + boardPadding * 2;
            return {
                boardPadding,
                gapX,
                gapY,
                itemsPerRow,
                totalRows,
                cardWidth: metrics.width,
                cardHeight: metrics.height,
                cardBorderWidth: metrics.borderWidth,
                cardHeaderHeight: metrics.headerHeight,
                cardBodyHeight: metrics.bodyHeight,
                cardBodyClipTop: metrics.bodyClipTop,
                cardBodyVisibleHeight: metrics.bodyVisibleHeight,
                captionHeight: metrics.captionHeight,
                captionBlockHeight: metrics.captionBlockHeight,
                rowPitch,
                boardWidth,
                boardHeight: Math.max(boardPadding * 2, boardHeight)
            };
        };

        const flowDiagramGridStyle = computed(() => {
            const frame = getFlowDiagramLayoutFrame();
            return {
                position: 'relative',
                width: `${frame.boardWidth - frame.boardPadding * 2}px`,
                height: `${Math.max(0, frame.boardHeight - frame.boardPadding * 2)}px`
            };
        });

        const getFlowDiagramCardStyle = (card) => {
            const frame = getFlowDiagramLayoutFrame();
            const x = (card.colIndex || 0) * (frame.cardWidth + frame.gapX);
            const y = (card.rowIndex || 0) * frame.rowPitch;
            return {
                position: 'absolute',
                left: `${x}px`,
                top: `${y}px`,
                width: `${frame.cardWidth}px`
            };
        };

        const getFlowDiagramCardRenderMeta = () => {
            const frame = getFlowDiagramLayoutFrame();
            return {
                cardHeight: frame.cardHeight,
                borderWidth: frame.cardBorderWidth,
                headerHeight: frame.cardHeaderHeight,
                bodyHeight: frame.cardBodyHeight,
                bodyClipTop: frame.cardBodyClipTop,
                bodyVisibleHeight: frame.cardBodyVisibleHeight,
                captionHeight: frame.captionHeight,
                captionBlockHeight: frame.captionBlockHeight
            };
        };

        const flowDiagramBoardStyle = computed(() => ({
            background: store.flowDiagramSettings.value.boardBackground,
            padding: `${store.flowDiagramSettings.value.boardPadding}px`,
            minHeight: '100%',
            boxSizing: 'border-box',
            borderRadius: '8px',
            overflow: 'visible'
        }));

        const updateFlowDiagramBoardMetrics = () => {
            if (!flowDiagramBoardRef.value) return;
            const boardPadding = Number(store.flowDiagramSettings.value.boardPadding) || 0;
            const boardElement = flowDiagramBoardRef.value.$el || flowDiagramBoardRef.value;
            const rawWidth = boardElement && boardElement.clientWidth ? boardElement.clientWidth : 0;
            flowDiagramBoardWidth.value = Math.max(0, rawWidth - boardPadding * 2);
        };

        const flowDiagramSummaryText = computed(() => {
            if (flowDiagramPipeline.isGeneratingFlowDiagram.value) {
                const done = flowDiagramPipeline.flowDiagramProgressDone.value || 0;
                const total = flowDiagramPipeline.flowDiagramProgressTotal.value || 0;
                return total > 0 ? `生成中 (${done}/${total})...` : '生成中...';
            }
            if (flowDiagramPipeline.flowDiagramGenerationError.value) return '生成失败';
            if (flowDiagramPipeline.isFlowDiagramDirty.value) return '需要刷新';
            return '已同步';
        });

        const previewResolutionText = computed(() => {
            if (!pendingPreviewDownload.value) return '';
            const width = pendingPreviewDownload.value.width || 0;
            const height = pendingPreviewDownload.value.height || 0;
            const scale = pendingPreviewDownload.value.scale || 1;
            if (!width || !height) return '';
            return `导出分辨率：${width} x ${height}（倍率 ${scale}x）`;
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

        const simulationDeps = computed(() => [
            ...store.processSteps.value.map(step => [
                step.id,
                step.type,
                step.thickness,
                step.angle,
                step.visible,
                ...(step.patterns || []).flatMap(pattern => [pattern.x, pattern.w])
            ]),
            ...store.variables.value.flatMap(variable => [variable.name, variable.value])
        ]);

        const processMetaDeps = computed(() => [
            ...store.processSteps.value.map(step => [
                step.id,
                step.name,
                step.material,
                step.flowDiagramCaption,
                step.visible
            ]),
            store.processSteps.value.length
        ]);

        const variableDeps = computed(() => [
            ...store.variables.value.flatMap(variable => [variable.name, variable.value]),
            store.variables.value.length
        ]);

        const updateSimulation = () => {
            if (window.calculateProfiles) {
                const parsed = store.getParsedSteps();
                const currentResult = window.calculateProfiles(parsed, { computeFullMaxH: true });
                store.engineResult.value = currentResult;
            }
        };

        const scheduleSimulationUpdate = () => {
            if (simulationFrameHandle !== null) return;
            simulationFrameHandle = window.requestAnimationFrame(() => {
                simulationFrameHandle = null;
                updateSimulation();
            });
        };

        watch(simulationDeps, () => {
            scheduleSimulationUpdate();
            if (!history.getIsUndoing()) {
                history.pushHistory();
            }
        }, { deep: true });
        watch(processMetaDeps, () => {
            if (!history.getIsUndoing()) {
                history.pushHistory();
            }
        }, { deep: true });
        watch(variableDeps, () => {
            if (!history.getIsUndoing()) {
                history.pushHistory();
            }
        }, { deep: true });
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

        watch(() => store.flowDiagramSettings.value.boardPadding, () => {
            if (store.viewMode.value !== 'flowDiagram') return;
            nextTick(() => {
                updateFlowDiagramBoardMetrics();
            });
        });

        watch([
            () => store.viewMode.value,
            triggerResize
        ], () => {
            if (store.viewMode.value !== 'flowDiagram') return;
            nextTick(() => {
                updateFlowDiagramBoardMetrics();
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
            if (simulationFrameHandle !== null) {
                window.cancelAnimationFrame(simulationFrameHandle);
                simulationFrameHandle = null;
            }
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

        const ensureSvgNamespace = (svgString) => {
            if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
                return svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
            }
            return svgString;
        };

        const getPngExportScale = (quality, mode) => {
            const normalizedQuality = quality || 'draft';
            if (mode === 'flowDiagram') {
                if (normalizedQuality === 'high') return 3;
                if (normalizedQuality === 'balanced') return 2;
                return 1.4;
            }
            return 1;
        };

        const triggerSvgDownload = (svgString, fileName) => {
            const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName}.svg`;
            a.click();
            URL.revokeObjectURL(url);
        };

        const openPngPreviewFromSvg = (svgString, fileName, exportWidth, exportHeight, options = {}) => {
            const scale = Number(options.scale) || 1;
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);

            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(exportWidth * scale));
                canvas.height = Math.max(1, Math.round(exportHeight * scale));
                const ctx = canvas.getContext('2d');

                if (ctx) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    previewImageUrl.value = canvas.toDataURL('image/png');
                    previewFileName.value = `${fileName}.png`;
                    pendingPreviewDownload.value = {
                        fileName: `${fileName}.png`,
                        width: canvas.width,
                        height: canvas.height,
                        scale
                    };
                    showPreviewModal.value = true;
                }
                URL.revokeObjectURL(url);
            };
            img.src = url;
        };

        const buildMainExportPayload = () => {
            if (!mainSvgRef.value) return null;

            const clonedSvg = mainSvgRef.value.cloneNode(true);
            const ignores = clonedSvg.querySelectorAll('.export-ignore, .flashing-path');
            ignores.forEach(el => el.remove());

            clonedSvg.style.position = '';
            clonedSvg.style.top = '';
            clonedSvg.style.left = '';
            clonedSvg.removeAttribute('width');
            clonedSvg.removeAttribute('height');

            let exportWidth = 1920;
            let exportHeight = 1080;
            const resObj = store.engineResult.value;
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
                exportWidth = tightWidth;
                exportHeight = tightHeight;
            }

            const serializer = new XMLSerializer();
            const svgString = ensureSvgNamespace(serializer.serializeToString(clonedSvg));
            const fileName = (store.projectName.value || 'NanoCross_Project') + '-export';

            return {
                svgString,
                fileName,
                exportWidth,
                exportHeight,
                exportQuality: 'main'
            };
        };

        const buildFlowDiagramExportPayload = () => {
            const cards = flowDiagramCards.value || [];
            if (!cards.length) return null;

            const frame = getFlowDiagramLayoutFrame(cards, { includeEditorChrome: false });
            const boardPadding = frame.boardPadding;
            const gapX = frame.gapX;
            const cardChrome = getFlowDiagramCardChrome();
            const captionGapRaw = Number(store.flowDiagramSettings.value.captionGap);
            const captionGap = Number.isFinite(captionGapRaw) ? Math.min(80, Math.max(-20, captionGapRaw)) : 12;
            const captionTextOffset = Math.max(8, captionGap + 18);
            const cardBorderWidth = frame.cardBorderWidth;
            const cardHeaderHeight = frame.cardHeaderHeight;
            const cardBodyHeight = frame.cardBodyHeight;
            const cardBodyClipTop = frame.cardBodyClipTop;
            const cardBodyVisibleHeight = frame.cardBodyVisibleHeight;
            const cardHeight = frame.cardHeight;
            const cardWidth = frame.cardWidth;
            const boardWidth = frame.boardWidth;
            const boardHeight = frame.boardHeight;
            const captionAnchor = getFlowDiagramCaptionAnchor();

            let svgParts = [
                `<svg xmlns="http://www.w3.org/2000/svg" width="${boardWidth}" height="${boardHeight}" viewBox="0 0 ${boardWidth} ${boardHeight}">`,
                `<rect x="0" y="0" width="${boardWidth}" height="${boardHeight}" fill="${store.flowDiagramSettings.value.boardBackground}"/>`
            ];

            cards.forEach(card => {
                const x = boardPadding + (card.colIndex || 0) * (cardWidth + gapX);
                const y = boardPadding + (card.rowIndex || 0) * frame.rowPitch;
                const captionTextAnchor = captionAnchor || 'middle';
                const captionTextX = captionTextAnchor === 'start'
                    ? 18
                    : (captionTextAnchor === 'end' ? Math.max(18, cardWidth - 18) : cardWidth / 2);
                const escapedCaption = (card.caption || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                svgParts.push(`<g transform="translate(${x}, ${y})">`);
                if (cardChrome === 'full') {
                    svgParts.push(`<rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" fill="#ffffff" stroke="#d1d5db" stroke-width="1"/>`);
                } else if (cardChrome === 'minimal') {
                    svgParts.push(`<rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" fill="#ffffff" stroke="#d5dce5" stroke-width="1"/>`);
                } else {
                    svgParts.push(`<rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" fill="#ffffff"/>`);
                }
                const viewBoxParts = String(card.viewBox || '0 0 1 1').split(/\s+/).map(Number);
                const viewBoxX = Number.isFinite(viewBoxParts[0]) ? viewBoxParts[0] : 0;
                const viewBoxY = Number.isFinite(viewBoxParts[1]) ? viewBoxParts[1] : 0;
                const viewBoxW = Number.isFinite(viewBoxParts[2]) && viewBoxParts[2] > 0 ? viewBoxParts[2] : 1;
                const viewBoxH = Number.isFinite(viewBoxParts[3]) && viewBoxParts[3] > 0 ? viewBoxParts[3] : 1;
                // 导出时复用预览里的压缩语义：gapY < 0 时，每张卡片都展示
                // 同一个被裁剪后的 body 视窗，而不是依赖行与行之间真实重叠。
                // 这样可以保留完整边框，也能避免第一行看起来比后续行更高。
                const clippedViewBoxY = viewBoxY + (cardBodyClipTop / Math.max(cardBodyHeight, 1)) * viewBoxH;
                const clippedViewBoxH = Math.max(1, (cardBodyVisibleHeight / Math.max(cardBodyHeight, 1)) * viewBoxH);
                const contentX = cardBorderWidth;
                const contentY = cardBorderWidth + cardHeaderHeight;
                const contentWidth = Math.max(1, cardWidth - cardBorderWidth * 2);
                svgParts.push(`<rect x="${contentX}" y="${contentY}" width="${contentWidth}" height="${cardBodyVisibleHeight}" fill="#ffffff"/>`);
                svgParts.push(
                    `<svg x="${contentX}" y="${contentY}" width="${contentWidth}" height="${cardBodyVisibleHeight}" viewBox="${viewBoxX} ${clippedViewBoxY} ${viewBoxW} ${clippedViewBoxH}" preserveAspectRatio="none">`
                );
                card.paths.forEach(path => {
                    svgParts.push(`<path d="${path.d}" fill="${path.fill}"></path>`);
                });
                svgParts.push(`</svg>`);

                if (store.flowDiagramSettings.value.showCaption) {
                    if (cardChrome === 'full') {
                        svgParts.push(`<line x1="${contentX}" y1="${contentY + cardBodyVisibleHeight}" x2="${contentX + contentWidth}" y2="${contentY + cardBodyVisibleHeight}" stroke="#ececec" stroke-width="1"/>`);
                    }
                    svgParts.push(
                        `<text x="${captionTextX}" y="${contentY + cardBodyVisibleHeight + (cardChrome === 'full' ? 1 : 0) + captionTextOffset}" text-anchor="${captionTextAnchor}" font-family="${store.flowDiagramSettings.value.fontFamily}" font-size="${store.flowDiagramSettings.value.fontSize}" fill="${store.flowDiagramSettings.value.fontColor}">${escapedCaption}</text>`
                    );
                }

                svgParts.push(`</g>`);
            });

            svgParts.push(`</svg>`);

            return {
                svgString: svgParts.join(''),
                fileName: (store.projectName.value || 'NanoCross_Project') + '-flow-diagram',
                exportWidth: boardWidth,
                exportHeight: boardHeight,
                exportQuality: store.flowDiagramSettings.value.quality
            };
        };

        const exportSvgPayload = (payload, format) => {
            if (!payload) return;
            if (format === 'svg') {
                triggerSvgDownload(payload.svgString, payload.fileName);
            } else if (format === 'png') {
                const exportMode = payload.exportQuality === 'main' ? 'main' : 'flowDiagram';
                const scale = getPngExportScale(payload.exportQuality, exportMode);
                openPngPreviewFromSvg(payload.svgString, payload.fileName, payload.exportWidth, payload.exportHeight, { scale });
            }
        };

        const ensureFlowDiagramExportGeometry = async (targetQuality) => {
            const summary = flowDiagramPipeline.flowDiagramGenerationSummary.value || {};
            const needsGeneration =
                !flowDiagramPipeline.allStepGeometry.value.length ||
                flowDiagramPipeline.isFlowDiagramDirty.value ||
                summary.quality !== targetQuality;

            if (!needsGeneration) {
                return true;
            }

            await flowDiagramPipeline.generateFlowDiagram(targetQuality);
            return !flowDiagramPipeline.flowDiagramGenerationError.value;
        };

        const continueFlowDiagramExport = async (format) => {
            const payload = buildFlowDiagramExportPayload();
            if (!payload) {
                alert('当前没有可导出的流程图子图。');
                return;
            }
            exportSvgPayload(payload, format);
        };

        const requestFlowDiagramExport = async (format) => {
            if (!flowDiagramCards.value.length) {
                alert('当前没有可导出的流程图子图。');
                return;
            }

            if (store.flowDiagramSettings.value.quality !== 'high') {
                pendingFlowDiagramExportFormat.value = format;
                showFlowDiagramExportQualityModal.value = true;
                return;
            }

            const ok = await ensureFlowDiagramExportGeometry('high');
            if (!ok) return;
            await continueFlowDiagramExport(format);
        };

        const confirmFlowDiagramHighExport = async () => {
            showFlowDiagramExportQualityModal.value = false;
            const targetFormat = pendingFlowDiagramExportFormat.value;
            pendingFlowDiagramExportFormat.value = '';
            if (!targetFormat) return;

            flowDiagramPipeline.suspendNextAutoRefresh();
            store.flowDiagramSettings.value.quality = 'high';
            const ok = await ensureFlowDiagramExportGeometry('high');
            if (!ok) return;
            await continueFlowDiagramExport(targetFormat);
        };

        const skipFlowDiagramHighExport = async () => {
            const targetFormat = pendingFlowDiagramExportFormat.value;
            showFlowDiagramExportQualityModal.value = false;
            pendingFlowDiagramExportFormat.value = '';
            if (!targetFormat) return;
            const currentQuality = store.flowDiagramSettings.value.quality || 'draft';
            const ok = await ensureFlowDiagramExportGeometry(currentQuality);
            if (!ok) return;
            await continueFlowDiagramExport(targetFormat);
        };

        const exportFile = async (format) => {
            if (store.viewMode.value === 'flowDiagram') {
                await requestFlowDiagramExport(format);
                return;
            }

            const payload = buildMainExportPayload();
            exportSvgPayload(payload, format);
        };

        const confirmDownloadPng = () => {
            if (!previewImageUrl.value) return;
            const a = document.createElement('a');
            a.href = previewImageUrl.value;
            a.download = pendingPreviewDownload.value && pendingPreviewDownload.value.fileName
                ? pendingPreviewDownload.value.fileName
                : previewFileName.value;
            a.click();
            showPreviewModal.value = false;
            pendingPreviewDownload.value = null;
        };

        const cancelDownloadPng = () => {
            showPreviewModal.value = false;
            previewImageUrl.value = '';
            pendingPreviewDownload.value = null;
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
            flowDiagramCards,
            hiddenFlowDiagramSteps,
            flowDiagramGridStyle,
            getFlowDiagramCardStyle,
            getFlowDiagramCardRenderMeta,
            flowDiagramBoardStyle,
            flowDiagramSummaryText,
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
            showFlowDiagramLegendSettingsModal,
            showPreviewModal,
            showFlowDiagramExportQualityModal,
            previewImageUrl,
            previewResolutionText,
            confirmDownloadPng,
            cancelDownloadPng,
            confirmFlowDiagramHighExport,
            skipFlowDiagramHighExport,
            mainSvgRef,
            legendModalPosition,
            flowDiagramModalPosition,
            flowDiagramLegendModalPosition,
            openLegendSettings,
            openFlowDiagramSettings,
            openFlowDiagramLegendSettings,
            startDragLegendSettings,
            startDragFlowDiagramSettings,
            startDragFlowDiagramLegendSettings,
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
