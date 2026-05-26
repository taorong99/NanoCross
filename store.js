// store.js - 核心数据中心：管理工艺步骤、全局变量以及封装对这些数据的增删改操作

function useStore() {
    const { ref, computed } = Vue;

    const createDefaultFlowDiagramSettings = () => ({
        itemsPerRow: 4,
        showCaption: true,
        fontFamily: 'Arial',
        fontSize: 14,
        fontColor: '#000000',
        textAlign: 'center',
        gapX: 24,
        gapY: 24,
        boardPadding: 20,
        boardBackground: '#ffffff',
        quality: 'draft',
        autoRefresh: false,
        hiddenStepIds: []
    });

    const normalizeFlowDiagramSettings = (settings) => {
        const defaults = createDefaultFlowDiagramSettings();
        const merged = { ...defaults, ...(settings || {}) };
        const parsedItemsPerRow = parseInt(merged.itemsPerRow, 10);
        merged.itemsPerRow = Number.isFinite(parsedItemsPerRow) && parsedItemsPerRow > 0 ? parsedItemsPerRow : defaults.itemsPerRow;
        merged.hiddenStepIds = Array.isArray(merged.hiddenStepIds) ? [...merged.hiddenStepIds] : [];
        if (!['draft', 'balanced', 'high'].includes(merged.quality)) {
            merged.quality = defaults.quality;
        }
        return merged;
    };

    const normalizeProcessStep = (step) => ({
        ...step,
        flowDiagramCaption: typeof step?.flowDiagramCaption === 'string' ? step.flowDiagramCaption : ''
    });

    // =========================================
    // 1. 核心状态与默认数据
    // =========================================
    // 默认工艺步骤
    const processSteps = ref([
        normalizeProcessStep({ id: 1, name: 'Substrate', type: 'deposit', thickness: 40, angle: 90, color: '#bdc3c7', visible: true, patterns: [{ x: 0, w: 600 }] }),
        normalizeProcessStep({ id: 2, name: 'M1 (CPW)', type: 'deposit', thickness: 30, angle: 75, color: '#f1c40f', visible: true, patterns: [{ x: -120, w: 60 }, { x: 0, w: 60 }, { x: 120, w: 60 }] }),
        normalizeProcessStep({ id: 3, name: 'ILD 1', type: 'deposit', thickness: 80, angle: 90, color: 'rgba(52, 152, 219, 0.4)', visible: true, patterns: [{ x: 0, w: 600 }] }),
        normalizeProcessStep({ id: 4, name: 'Via 1', type: 'etch', thickness: 80, angle: 85, color: 'transparent', visible: true, patterns: [{ x: -120, w: 20 }, { x: 120, w: 20 }] }),
        normalizeProcessStep({ id: 5, name: 'M2 (Top)', type: 'deposit', thickness: 30, angle: 75, color: '#e67e22', visible: true, patterns: [{ x: 0, w: 350 }] }),
        normalizeProcessStep({ id: 6, name: 'CMP 平坦化', type: 'cmp', thickness: 10, angle: 90, color: 'transparent', visible: true, patterns: [] })
    ]);

    const variables = ref([
        { name: 'w1', value: '60' },
        { name: 'gap', value: '120' }
    ]);

    const legendSettings = ref({
        showLegend: true,
        widthMode: 'substrate', // 'substrate' 或 'custom'
        customWidth: 800,
        marginTop: 40,
        itemsPerRow: 4,
        iconSize: 20,     // 图例每一个颜色方块的边长
        bgColor: '#ffffff',
        fontColor: '#000000',
        fontFamily: 'Arial',
        fontSize: 14,     // 图例字体大小
        textSource: 'name', // 'name' 或 'material'
        hiddenLegendIds: [] // 不显示的图层ID列表
    });

    const flowDiagramSettings = ref(createDefaultFlowDiagramSettings());
    const viewMode = ref('main');

    const projectName = ref('');

    const activeLayerIndex = ref(0);
    const activeStep = computed(() => processSteps.value[activeLayerIndex.value]);

    const engineResult = ref({ profiles: [], minX: 0, maxX: 0, subLeft: -400, subRight: 400, maxH: 300 });

    // =========================================
    // 2. 状态衍生：变量计算与表达式安全求值
    // =========================================
    const safeEval = (expr, scope) => {
        if (typeof expr !== 'string') return expr || 0;
        if (!expr.trim()) return 0;
        try { return window.math.evaluate(expr, scope) || 0; }
        catch (e) { return 0; }
    };

    // 安全地将当前带变量的步骤解析为供引擎计算的纯数字表示
    const getParsedSteps = () => {
        let scope = {};
        variables.value.forEach(v => {
            if(v.name && v.value) { 
                try { scope[v.name] = window.math.evaluate(v.value, scope); } catch(e) {} 
            }
        });
        return processSteps.value.map(step => {
            const parsedPatterns = step.patterns
                ? step.patterns.map(p => ({
                    x: safeEval(p.x, scope),
                    w: safeEval(p.w, scope)
                }))
                : [];

            return {
                id: step.id,
                type: step.type,
                thickness: safeEval(step.thickness, scope),
                angle: safeEval(step.angle, scope),
                color: step.color,
                visible: step.visible,
                patterns: parsedPatterns
            };
        });
    };

    // 导出一个计算属性形式的解析后数据，供画布和视图等依赖响应式自动更新
    const parsedSteps = computed(() => getParsedSteps());

    // =========================================
    // 3. 用户行为方法 - 工艺与图案的增删改
    // =========================================
    const addPattern = () => {
        if (activeStep.value) {
            if (!activeStep.value.patterns) activeStep.value.patterns = [];
            activeStep.value.patterns.push({ x: 0, w: 100 });
        }
    };

    const removePattern = (idx) => {
        if (activeStep.value) activeStep.value.patterns.splice(idx, 1);
    };

    const addStep = (type) => {
        const subThickness = processSteps.value[0] ? processSteps.value[0].thickness : 40;
        const subWidth = (processSteps.value[0] && processSteps.value[0].patterns && processSteps.value[0].patterns[0]) ? processSteps.value[0].patterns[0].w : 600;
        
        let newThickness = 20;
        let newPatterns = [];
        
        if (type === 'cmp') {
            newThickness = 10;
        } else if (type === 'deposit') {
            newThickness = Math.round(subThickness / 2);
            newPatterns = [{ x: 0, w: subWidth }];
        } else if (type === 'etch') {
            newThickness = Math.round(subThickness / 2);
            newPatterns = [{ x: 0, w: Math.round(subWidth / 10) }];
        }

        processSteps.value.push({
            id: Date.now(), 
            name: `New ${type}`, 
            type: type, 
            thickness: newThickness, 
            angle: 90, 
            color: type === 'deposit' ? '#e74c3c' : 'transparent', 
            visible: true, 
            patterns: newPatterns,
            flowDiagramCaption: ''
        });
        activeLayerIndex.value = processSteps.value.length - 1;
    };

    const deleteStep = (idx) => {
        if (idx === 0) { alert("衬底是基础图案，不能删除！"); return; }
        const removedStep = processSteps.value[idx];
        if (removedStep) {
            flowDiagramSettings.value.hiddenStepIds = flowDiagramSettings.value.hiddenStepIds.filter(id => id !== removedStep.id);
        }
        processSteps.value.splice(idx, 1);
        activeLayerIndex.value = Math.max(0, activeLayerIndex.value - 1);
    };

    const toggleVisibility = (idx) => {
        const step = processSteps.value[idx];
        if (!step) return;
        if (step.visible) {
            processSteps.value.forEach((s, i) => { if(i >= idx) s.visible = false; });
        } else {
            processSteps.value.forEach(s => s.visible = true);
        }
    };

    return {
        createDefaultFlowDiagramSettings,
        normalizeFlowDiagramSettings,
        normalizeProcessStep,
        projectName,
        processSteps,
        variables,
        legendSettings,
        flowDiagramSettings,
        viewMode,
        activeLayerIndex,
        activeStep,
        engineResult,
        getParsedSteps,
        parsedSteps,
        addPattern,
        removePattern,
        addStep,
        deleteStep,
        toggleVisibility
    };
}
