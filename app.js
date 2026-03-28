// app.js - 核心应用入口：负责组装各个模块，并挂载 Vue 实例
const { createApp, ref, watch, onMounted, onUnmounted } = Vue;

const App = {
    setup() {
        // 1. 获取各个模块的状态
        const store = useStore();
        const history = useHistory(store.processSteps, store.variables);
        
        // UI 交互状态
        const variablesMinimized = ref(false);
        const hoverLayerIndex = ref(-1);
        const hoverPatternIndex = ref(-1);
        const focusedPatternIndex = ref(-1);
        const flashingPatternIndex = ref(-1);
        const hoverCardPatternIndex = ref(-1);
        
        // 布局尺寸
        const triggerResize = ref(0);
        const layersWidth = ref(250);
        const propsWidth = ref(300);
        let activeResizer = null;

        // 画布属性，将需要依赖的全局数据传入
        const canvasProps = useCanvas(
            store.engineResult, 
            triggerResize, 
            store.processSteps, 
            store.activeLayerIndex, 
            hoverLayerIndex, 
            hoverPatternIndex, 
            focusedPatternIndex, 
            flashingPatternIndex, 
            hoverCardPatternIndex
        );

        // 2. 核心联动：当参数改变时更新仿真计算并记录历史
        const updateSimulation = () => {
            if (window.calculateProfiles) {
                const parsed = store.getParsedSteps();
                const currentResult = window.calculateProfiles(parsed);
                // 运行一次所有视为可见的总高度，用于锁定 viewBox 视角不乱跳
                const fullParsed = parsed.map(s => ({ ...s, visible: true }));
                const fullResult = window.calculateProfiles(fullParsed);
                currentResult.fullMaxH = fullResult.maxH;
                store.engineResult.value = currentResult;
            }
            if (!history.getIsUndoing()) {
                history.pushHistory();
            }
        };

        watch(store.processSteps, updateSimulation, { deep: true });
        watch(store.variables, updateSimulation, { deep: true });

        // 只重置聚焦状态
        watch(store.activeLayerIndex, () => {
            focusedPatternIndex.value = -1;
            flashingPatternIndex.value = -1;
        });

        const globalMouseUp = (e) => {
            endResize();
            if (canvasProps.endPan) canvasProps.endPan(e);
        };
        const globalMouseMove = (e) => {
            doResize(e);
            if (canvasProps.doPan) canvasProps.doPan(e);
        };

        // 3. 生命周期与全局事件
        onMounted(() => {
            updateSimulation();
            history.pushHistory();
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('mouseup', globalMouseUp);
            window.addEventListener('mousemove', globalMouseMove);
        });

        onUnmounted(() => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mouseup', globalMouseUp);
            window.removeEventListener('mousemove', globalMouseMove);
        });

        // 4. 事件处理器
        const handleKeyDown = (e) => {
            if ((e.target.tagName === 'INPUT' && e.target.type !== 'range') || e.target.tagName === 'TEXTAREA') return;
            // 撤销/重做
            if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); history.undo(); return; }
            if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); history.redo(); return; }
            // 键盘平移给 canvas 处理
            if (canvasProps.handleKeyDown) canvasProps.handleKeyDown(e);
        };

        const onCanvasPatternClick = (layerIdx, pIdx) => {
            store.activeLayerIndex.value = layerIdx;
            setTimeout(() => { 
                flashingPatternIndex.value = pIdx; 
                focusedPatternIndex.value = -1; 
            }, 10);
        };

        // 窗口拖拽大小
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

        // 拖拽步骤排序
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

        // 文件导入导出
        const exportFile = () => {
            alert('导出功能预留：未来可支持导出其他格式。');
        };

        const loadFile = async () => {
            try {
                // 1. 从服务器获取可选的项目列表
                const res = await fetch('/api/designs');
                if (!res.ok) throw new Error('无法连接到服务器以获取项目列表');
                
                const projects = await res.json();
                if (projects.length === 0) {
                    alert('服务器上还没有保存任何项目。');
                    return;
                }

                // 2. 弹窗让用户输入要加载的项目名（并提示可用的列表）
                const listText = projects.join('\n- ');
                const inputName = prompt(`请输入要加载的项目名称 (不带.json):\n\n当前服务器包含以下项目:\n- ${listText}`);
                
                if (!inputName) return; // 用户取消

                // 3. 将所选项目向服务器请求加载
                const loadRes = await fetch(`/api/load/${encodeURIComponent(inputName)}`);
                if (!loadRes.ok) throw new Error(`项目 "${inputName}" 不存在或读取失败`);
                
                const data = await loadRes.json();
                
                // 4. 应用数据到当前界面
                if (data.projectName) {
                    store.projectName.value = data.projectName;
                }
                if (data.variables && Array.isArray(data.variables)) {
                    store.variables.value = data.variables;
                }
                if (data.processSteps && Array.isArray(data.processSteps)) {
                    store.processSteps.value = data.processSteps;
                    store.activeLayerIndex.value = Math.max(0, data.processSteps.length - 1);
                    if (history && history.pushHistory) {
                        setTimeout(history.pushHistory, 100);
                    }
                } else {
                    alert('获取到的文件格式无效（缺少 processSteps 数据）');
                }
            } catch (err) {
                alert('加载出错: ' + err.message + '\n请确认您当前正在通过后端环境(Node)访问该页面，而非直接双击打开本地 HTML。');
            }
        };

        const saveFile = async () => {
            // 如果不存在项目名称，则要求用户必须输入
            let nameToSave = store.projectName.value;
            if (!nameToSave || nameToSave.trim() === '') {
                const name = prompt("请输入将存入服务器的项目名称：");
                if (name && name.trim() !== '') {
                    nameToSave = name.trim();
                    store.projectName.value = nameToSave;
                } else {
                    return; // 取消保存
                }
            }
            
            const saveData = {
                projectName: nameToSave,
                variables: store.variables.value,
                processSteps: store.processSteps.value
            };

            // 直接通过 HTTP API 推送到服务器
            try {
                const response = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(saveData)
                });
                
                if (response.ok) {
                    alert(`保存成功！数据已后台写入 /designs/${nameToSave}.json`);
                } else {
                    const errMsg = await response.text();
                    throw new Error(errMsg);
                }
            } catch (err) {
                alert('后台保存失败: ' + err.message + '\n请确认您当前正在通过后端环境(Node)访问该页面，而非直接双击打开本地 HTML。');
            }
        };

        // 5. 导出供模板使用
        return {
            ...store,
            ...canvasProps,
            history,
            loadFile,
            saveFile,
            exportFile,
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
