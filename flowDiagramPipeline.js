// flowDiagramPipeline.js - 流程图模式专用生成管线

function useFlowDiagramPipeline(options) {
    const { ref, computed, watch } = Vue;
    const processSteps = options.processSteps;
    const parsedSteps = options.parsedSteps;
    const flowDiagramSettings = options.flowDiagramSettings;
    const viewMode = options.viewMode;
    const mainEngineResult = options.mainEngineResult;
    const targetViewport = options.targetViewport;
    const FLOW_DIAGRAM_MIN_VIEWPORT = 100;

    const qualityGridMap = {
        draft: 4,
        balanced: 7,
        high: 10
    };

    const allStepGeometry = ref([]);
    const isFlowDiagramDirty = ref(true);
    const isGeneratingFlowDiagram = ref(false);
    const flowDiagramGenerationError = ref('');
    const flowDiagramGenerationSummary = ref({ generatedAt: 0, quality: flowDiagramSettings.value.quality, count: 0 });

    let refreshTimer = null;

    const visibleHiddenIds = computed(() => new Set(flowDiagramSettings.value.hiddenStepIds || []));

    const visibleFlowDiagramCards = computed(() => {
        return allStepGeometry.value.filter(item => !visibleHiddenIds.value.has(item.stepId));
    });

    const markDirty = () => {
        isFlowDiagramDirty.value = true;
    };

    const getGridRes = (quality) => {
        return qualityGridMap[quality] || qualityGridMap.draft;
    };

    const getTargetViewport = () => {
        const width = targetViewport && targetViewport.value && targetViewport.value.width ? targetViewport.value.width : 300;
        const height = targetViewport && targetViewport.value && targetViewport.value.height ? targetViewport.value.height : 220;
        return {
            width: Math.max(FLOW_DIAGRAM_MIN_VIEWPORT, width),
            height: Math.max(FLOW_DIAGRAM_MIN_VIEWPORT, height)
        };
    };

    const rebuildFlowDiagramLayout = () => {
        if (!allStepGeometry.value.length) return;
        const snapshots = allStepGeometry.value.map(item => ({
            stepIndex: item.stepIndex,
            engineResult: item.engineResult,
            quality: item.quality
        }));
        const scaleMeta = getScaleMeta(snapshots);
        allStepGeometry.value = snapshots.map(snapshot =>
            createSnapshotGeometry(snapshot.stepIndex, snapshot.engineResult, scaleMeta, snapshot.quality)
        );
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
        const viewport = getTargetViewport();
        const targetWidth = viewport.width;
        const targetHeight = viewport.height;
        const scaleX = targetWidth / scaleMeta.viewBoxWidth;
        const scaleY = targetHeight / scaleMeta.viewBoxHeight;
        const mapPoint = (x, y) => ({
            x: (x - scaleMeta.viewBoxX) * scaleX,
            y: (y - scaleMeta.viewBoxY) * scaleY
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
            viewBox: `0 0 ${targetWidth} ${targetHeight}`,
            width: targetWidth,
            height: targetHeight,
            scaleMeta
        };
    };

    const generateFlowDiagram = async (requestedQuality) => {
        const quality = requestedQuality || flowDiagramSettings.value.quality;
        flowDiagramGenerationError.value = '';
        isGeneratingFlowDiagram.value = true;

        try {
            const snapshots = [];
            for (let stepIndex = 0; stepIndex < parsedSteps.value.length; stepIndex++) {
                const prefixSteps = parsedSteps.value.slice(0, stepIndex + 1).map(step => ({ ...step, visible: true }));
                const engineResult = window.calculateProfiles(prefixSteps, { gridRes: getGridRes(quality) });
                const fullResult = window.calculateProfiles(prefixSteps.map(step => ({ ...step, visible: true })), { gridRes: getGridRes(quality) });
                engineResult.fullMaxH = fullResult.maxH;
                snapshots.push({ stepIndex, engineResult });
            }

            const scaleMeta = getScaleMeta(snapshots);
            allStepGeometry.value = snapshots.map(snapshot => createSnapshotGeometry(snapshot.stepIndex, snapshot.engineResult, scaleMeta, quality));
            flowDiagramGenerationSummary.value = {
                generatedAt: Date.now(),
                quality,
                count: allStepGeometry.value.length
            };
            isFlowDiagramDirty.value = false;
        } catch (error) {
            flowDiagramGenerationError.value = error && error.message ? error.message : '流程图生成失败';
        } finally {
            isGeneratingFlowDiagram.value = false;
        }
    };

    const scheduleAutoRefresh = () => {
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

    watch(() => JSON.stringify(getTargetViewport()), () => {
        rebuildFlowDiagramLayout();
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
        visibleFlowDiagramCards,
        isFlowDiagramDirty,
        isGeneratingFlowDiagram,
        flowDiagramGenerationError,
        flowDiagramGenerationSummary,
        generateFlowDiagram,
        markDirty,
        rebuildFlowDiagramLayout
    };
}
