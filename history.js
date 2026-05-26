// history.js - 负责处理撤销、重做与历史记录栈的管理

function useHistory(processSteps, variables, flowDiagramSettings) {
    const { ref } = Vue;
    const cloneState = (value) => {
        if (typeof structuredClone === 'function') {
            return structuredClone(value);
        }
        return JSON.parse(JSON.stringify(value));
    };
    
    // =========================================
    // 1. 历史栈及内部状态
    // =========================================
    const historyStack = ref([]);
    const historyIndex = ref(-1);
    let isUndoing = false;
    let historyTimer = null;

    // =========================================
    // 2. 核心方法：入栈与延时防抖保存
    // =========================================
    const pushHistory = () => {
        if (isUndoing) return;

        clearTimeout(historyTimer);
        historyTimer = setTimeout(() => {
            if (historyIndex.value < historyStack.value.length - 1) {
                historyStack.value = historyStack.value.slice(0, historyIndex.value + 1);
            }
            historyStack.value.push({
                steps: cloneState(processSteps.value),
                vars: cloneState(variables.value),
                flowDiagramSettings: cloneState(flowDiagramSettings.value)
            });
            historyIndex.value++;
        }, 1000); // 延迟1000ms，让连续修改（如滑块拖动）只保存最后一次
    };

    // =========================================
    // 3. 核心方法：撤销 (Undo)与 重做 (Redo)
    // =========================================
    const undo = () => {
        if (historyIndex.value > 0) {
            clearTimeout(historyTimer);
            isUndoing = true;
            historyIndex.value--;
            const state = historyStack.value[historyIndex.value];
            processSteps.value = cloneState(state.steps);
            variables.value = cloneState(state.vars);
            flowDiagramSettings.value = cloneState(state.flowDiagramSettings);
            setTimeout(() => { isUndoing = false; }, 50);
        }
    };

    const redo = () => {
        if (historyIndex.value < historyStack.value.length - 1) {
            clearTimeout(historyTimer);
            isUndoing = true;
            historyIndex.value++;
            const state = historyStack.value[historyIndex.value];
            processSteps.value = cloneState(state.steps);
            variables.value = cloneState(state.vars);
            flowDiagramSettings.value = cloneState(state.flowDiagramSettings);
            setTimeout(() => { isUndoing = false; }, 50);
        }
    };

    const getIsUndoing = () => isUndoing;
    const canUndo = Vue.computed(() => historyIndex.value > 0);
    const canRedo = Vue.computed(() => historyIndex.value < historyStack.value.length - 1);

    return { 
        historyStack, 
        historyIndex, 
        pushHistory, 
        undo, 
        redo, 
        getIsUndoing,
        canUndo,
        canRedo
    };
}
