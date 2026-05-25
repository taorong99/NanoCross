// flowDiagramPipeline.js - 流程图模式专用生成管线

function useFlowDiagramPipeline(options) {
    const { ref, computed, watch } = Vue;
    const processSteps = options.processSteps;
    const parsedSteps = options.parsedSteps;
    const flowDiagramSettings = options.flowDiagramSettings;
    const viewMode = options.viewMode;
    const mainEngineResult = options.mainEngineResult;
    const stepMetaMap = options.stepMetaMap;
    const layoutMeta = options.layoutMeta;
    const FLOW_DIAGRAM_BATCH_SIZE = 2;

    const qualityGridMap = {
        draft: 4,
        balanced: 7,
        high: 10
    };

    const allStepGeometry = ref([]);
    const items = ref([]);
    const isFlowDiagramDirty = ref(true);
    const isGeneratingFlowDiagram = ref(false);
    const flowDiagramGenerationError = ref('');
    const flowDiagramGenerationSummary = ref({ generatedAt: 0, quality: flowDiagramSettings.value.quality, count: 0 });
    const flowDiagramProgressDone = ref(0);
    const flowDiagramProgressTotal = ref(0);

    let refreshTimer = null;
    let generationToken = 0;
    let suppressAutoRefreshOnce = false;

    const visibleHiddenIds = computed(() => new Set(flowDiagramSettings.value.hiddenStepIds || []));

    const markDirty = () => {
        isFlowDiagramDirty.value = true;
    };

    const getEffectiveItemsPerRow = () => {
        if (!layoutMeta || !layoutMeta.value) {
            return Math.max(1, flowDiagramSettings.value.itemsPerRow || 1);
        }
        return Math.max(1, layoutMeta.value.effectiveItemsPerRow || 1);
    };

    const buildHiddenItems = () => {
        const hiddenIds = flowDiagramSettings.value.hiddenStepIds || [];
        return hiddenIds
            .map((id, hiddenOrder) => {
                const meta = stepMetaMap && stepMetaMap.value ? stepMetaMap.value.get(id) : null;
                if (!meta) return null;
                return {
                    stepId: id,
                    hiddenOrder,
                    step: meta.step,
                    index: meta.index,
                    stepIndex: meta.index,
                    stepName: meta.step.name,
                    caption: meta.step.flowDiagramCaption || meta.step.name || '',
                    isHidden: true
                };
            })
            .filter(Boolean);
    };

    const rebuildItems = () => {
        const effectiveItemsPerRow = getEffectiveItemsPerRow();
        items.value = allStepGeometry.value
            .map(item => {
                const meta = stepMetaMap && stepMetaMap.value ? stepMetaMap.value.get(item.stepId) : null;
                if (!meta) return null;
                return {
                    ...item,
                    step: meta.step,
                    index: meta.index,
                    stepIndex: meta.index,
                    stepName: meta.step.name,
                    caption: meta.step.flowDiagramCaption || meta.step.name || '',
                    isHidden: visibleHiddenIds.value.has(item.stepId)
                };
            })
            .filter(item => item && !item.isHidden)
            .map((item, visibleIndex) => ({
                ...item,
                layoutIndex: visibleIndex,
                rowIndex: Math.floor(visibleIndex / effectiveItemsPerRow),
                colIndex: visibleIndex % effectiveItemsPerRow
            }));
    };

    const getGridRes = (quality) => {
        return qualityGridMap[quality] || qualityGridMap.draft;
    };

    const yieldToBrowser = () => {
        return new Promise(resolve => {
            if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(() => resolve(), { timeout: 32 });
            } else {
                setTimeout(resolve, 0);
            }
        });
    };

    const rebuildFlowDiagramLayout = () => {
        if (!allStepGeometry.value.length) return;
        rebuildItems();
    };

    const getScaleMeta = (snapshots) => {
        let subLeft = -400;
        let subRight = 400;
        let maxHeight = 0;
        let minBaseY = 500;

        snapshots.forEach(snapshot => {
            if (!snapshot.engineResult) return;
            const result = snapshot.engineResult;
            if (typeof result.subLeft === 'number') subLeft = result.subLeft;
            if (typeof result.subRight === 'number') subRight = result.subRight;
            const snapshotMax = result.fullMaxH !== undefined ? result.fullMaxH : result.maxH;
            if (snapshotMax > maxHeight) maxHeight = snapshotMax;
            if (Array.isArray(result.profiles)) {
                result.profiles.forEach(profile => {
                    if (!profile || !Array.isArray(profile.points)) return;
                    profile.points.forEach(point => {
                        if (Array.isArray(point) && typeof point[1] === 'number' && point[1] < minBaseY) {
                            minBaseY = point[1];
                        }
                    });
                });
            }
        });

        const finalResult = mainEngineResult && mainEngineResult.value ? mainEngineResult.value : null;
        const finalMaxHeight = finalResult
            ? (finalResult.fullMaxH !== undefined ? finalResult.fullMaxH : finalResult.maxH)
            : maxHeight;
        if (finalResult && Array.isArray(finalResult.profiles)) {
            finalResult.profiles.forEach(profile => {
                if (!profile || !Array.isArray(profile.points)) return;
                profile.points.forEach(point => {
                    if (Array.isArray(point) && typeof point[1] === 'number' && point[1] < minBaseY) {
                        minBaseY = point[1];
                    }
                });
            });
        }
        const resolvedMaxHeight = Math.max(maxHeight, finalMaxHeight || 0, 1);
        const viewBoxX = subLeft;
        const topY = Math.min(minBaseY, 500 - resolvedMaxHeight);
        const viewBoxY = topY;
        const viewBoxWidth = Math.max(subRight - subLeft, 1);
        const viewBoxHeight = Math.max(500 - topY, 1);

        return {
            subLeft,
            subRight,
            maxHeight: resolvedMaxHeight,
            viewBoxX,
            viewBoxY,
            viewBoxWidth,
            viewBoxHeight
        };
    };

    const createSnapshotGeometry = (stepIndex, engineResult, scaleMeta, quality) => {
        const prefixSteps = parsedSteps.value.slice(0, stepIndex + 1).map(step => ({ ...step, visible: true }));
        const stepMeta = processSteps.value[stepIndex];
        const normalizedWidth = Math.max(scaleMeta.viewBoxWidth, 1);
        const normalizedHeight = Math.max(scaleMeta.viewBoxHeight, 1);
        const mapPoint = (x, y) => ({
            x: x - scaleMeta.viewBoxX,
            y: y - scaleMeta.viewBoxY
        });
        const paths = typeof window.buildSectionPathData === 'function'
            ? window.buildSectionPathData(engineResult, prefixSteps, {
                includeHidden: true,
                idPrefix: `fd-${stepMeta.id}-`,
                clipXMin: scaleMeta.subLeft,
                clipXMax: scaleMeta.subRight,
                mapPoint
            })
            : [];

        return {
            stepId: stepMeta.id,
            stepIndex,
            stepName: stepMeta.name,
            stepType: stepMeta.type,
            engineResult,
            paths,
            quality,
            viewBox: `0 0 ${normalizedWidth} ${normalizedHeight}`,
            normalizedWidth,
            normalizedHeight,
            scaleMeta
        };
    };

    const generateFlowDiagram = async (requestedQuality) => {
        const quality = requestedQuality || flowDiagramSettings.value.quality;
        const currentToken = ++generationToken;
        if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }
        flowDiagramGenerationError.value = '';
        isGeneratingFlowDiagram.value = true;
        flowDiagramProgressDone.value = 0;
        flowDiagramProgressTotal.value = parsedSteps.value.length;

        try {
            if (!parsedSteps.value.length) {
                allStepGeometry.value = [];
                rebuildItems();
                flowDiagramGenerationSummary.value = {
                    generatedAt: Date.now(),
                    quality,
                    count: 0
                };
                isFlowDiagramDirty.value = false;
                return;
            }

            const snapshots = [];
            for (let stepIndex = 0; stepIndex < parsedSteps.value.length; stepIndex++) {
                if (currentToken !== generationToken) return;
                const prefixSteps = parsedSteps.value.slice(0, stepIndex + 1).map(step => ({ ...step, visible: true }));
                const engineResult = window.calculateProfiles(prefixSteps, { gridRes: getGridRes(quality) });
                engineResult.fullMaxH = engineResult.maxH;
                snapshots.push({ stepIndex, engineResult });
                flowDiagramProgressDone.value = stepIndex + 1;

                const reachedBatchBoundary = (stepIndex + 1) % FLOW_DIAGRAM_BATCH_SIZE === 0;
                const hasMoreSteps = stepIndex < parsedSteps.value.length - 1;
                if (reachedBatchBoundary && hasMoreSteps) {
                    await yieldToBrowser();
                }
            }

            if (currentToken !== generationToken) return;
            const scaleMeta = getScaleMeta(snapshots);
            allStepGeometry.value = snapshots.map(snapshot => createSnapshotGeometry(snapshot.stepIndex, snapshot.engineResult, scaleMeta, quality));
            rebuildItems();
            flowDiagramGenerationSummary.value = {
                generatedAt: Date.now(),
                quality,
                count: allStepGeometry.value.length
            };
            isFlowDiagramDirty.value = false;
        } catch (error) {
            flowDiagramGenerationError.value = error && error.message ? error.message : '流程图生成失败';
        } finally {
            if (currentToken === generationToken) {
                isGeneratingFlowDiagram.value = false;
            }
        }
    };

    const scheduleAutoRefresh = () => {
        if (suppressAutoRefreshOnce) {
            suppressAutoRefreshOnce = false;
            return;
        }
        if (refreshTimer) {
            clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(() => {
            refreshTimer = null;
            if (flowDiagramSettings.value.autoRefresh && viewMode.value === 'flowDiagram') {
                generateFlowDiagram();
            }
        }, 360);
    };

    const suspendNextAutoRefresh = () => {
        suppressAutoRefreshOnce = true;
        if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }
    };

    const geometrySignature = computed(() => JSON.stringify(
        parsedSteps.value.map(step => ({
            id: step.id,
            type: step.type,
            thickness: step.thickness,
            angle: step.angle,
            color: step.color,
            patterns: (step.patterns || []).map(pattern => ({
                x: pattern.x,
                w: pattern.w
            }))
        }))
    ));

    watch(geometrySignature, () => {
        markDirty();
        scheduleAutoRefresh();
    });

    watch(() => flowDiagramSettings.value.quality, () => {
        markDirty();
        scheduleAutoRefresh();
    });

    watch(visibleHiddenIds, () => {
        rebuildItems();
    });

    watch(() => JSON.stringify(
        processSteps.value.map(step => ({
            id: step.id,
            name: step.name,
            flowDiagramCaption: step.flowDiagramCaption
        }))
    ), () => {
        rebuildItems();
    });

    watch(() => getEffectiveItemsPerRow(), () => {
        rebuildItems();
    });

    watch(viewMode, (mode) => {
        if (mode === 'flowDiagram' && !isGeneratingFlowDiagram.value) {
            if (allStepGeometry.value.length === 0) {
                generateFlowDiagram();
            } else if (flowDiagramSettings.value.autoRefresh && isFlowDiagramDirty.value) {
                generateFlowDiagram();
            }
        }
    });

    return {
        allStepGeometry,
        items,
        hiddenItems: computed(() => buildHiddenItems()),
        isFlowDiagramDirty,
        isGeneratingFlowDiagram,
        flowDiagramGenerationError,
        flowDiagramGenerationSummary,
        flowDiagramProgressDone,
        flowDiagramProgressTotal,
        generateFlowDiagram,
        markDirty,
        suspendNextAutoRefresh,
        rebuildFlowDiagramLayout
    };
}
