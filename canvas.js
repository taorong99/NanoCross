// canvas.js - 负责处理画布相关的视图计算、缩放、平移等控制逻辑

function useCanvas(engineResult, triggerResize, processSteps, activeLayerIndex, hoverLayerIndex, hoverPatternIndex, focusedPatternIndex, flashingPatternIndex, hoverCardPatternIndex) {
    const { ref, computed } = Vue;

    // =========================================
    // 1. 画布缩放与平移状态
    // =========================================
    const currentZoom = ref(100);
    const pan = ref({ x: 0, y: 0 });
    let isPanning = false;
    let lastMouse = { x: 0, y: 0 };

    // =========================================
    // 2. 交互操作：鼠标平移处理
    // =========================================
    const startPan = (e) => {
        isPanning = true;
        lastMouse = { x: e.clientX, y: e.clientY };
    };

    const doPan = (e) => {
        if (!isPanning) return;
        const _zoom = parseInt(currentZoom.value, 10);
        
        if (_zoom <= 100) {
            pan.value.x = 0;
            pan.value.y = 0;
            lastMouse = { x: e.clientX, y: e.clientY };
            return;
        }
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;
        const container = document.querySelector('.canvas-container');
        const cw = container ? container.clientWidth : 800;
        const ch = container ? container.clientHeight : 600;
        
        const maxH = engineResult.value.fullMaxH !== undefined ? engineResult.value.fullMaxH : engineResult.value.maxH;
        const baseW = (engineResult.value.subRight - engineResult.value.subLeft) + 200;
        const baseH = maxH + 300;
        
        const maxRatio = Math.max(baseW / cw, baseH / ch);
        const scale = maxRatio / (_zoom / 100);

        pan.value.x += dx * scale;
        pan.value.y += dy * scale;

        lastMouse = { x: e.clientX, y: e.clientY };
    };

    const endPan = () => { isPanning = false; };

    const resetZoom = () => {
        currentZoom.value = 100;
        pan.value.x = 0;
        pan.value.y = 0;
    };

    // =========================================
    // 3. 画布坐标轴元素计算
    // =========================================
    // 绘制基于物理尺寸的坐标轴
    const axisElements = computed(() => {
        let elements = [];
        const subL = engineResult.value.subLeft || -400;
        const subR = engineResult.value.subRight || 400;
        const maxH = engineResult.value.fullMaxH !== undefined ? engineResult.value.fullMaxH : (engineResult.value.maxH || 0);

        const topY = 500 - maxH - 15;
        const minXAxis = Math.floor(subL / 100) * 100;
        const maxXAxis = Math.ceil(subR / 100) * 100;

        for (let x = minXAxis; x <= maxXAxis; x += 100) {
            elements.push({ id: `x-bot-${x}`, x: x, y: 515, text: x, anchor: 'middle', baseline: 'auto' });
            elements.push({ id: `x-top-${x}`, x: x, y: topY, text: x, anchor: 'middle', baseline: 'auto' });
        }

        const tagLeftX = subL - 10;
        const tagRightX = subR + 10;
        const maxYAxis = Math.ceil((maxH + 20) / 100) * 100;
        for (let y = 0; y <= maxYAxis; y += 100) {
            elements.push({ id: `y-left-${y}`, x: tagLeftX, y: 500 - y, text: y, anchor: 'end', baseline: 'middle' });
            elements.push({ id: `y-right-${y}`, x: tagRightX, y: 500 - y, text: y, anchor: 'start', baseline: 'middle' });
        }
        return elements;
    });

    // =========================================
    // 4. ViewBox 映射逻辑：将物理坐标轴缩放和平移绑定到 SVG 视口
    // =========================================
    // 计算 SVG viewBox 物理坐标映射
    const viewBox = computed(() => {
        const _trig = triggerResize.value; // 用于强制更新的依赖
        const _zoom = parseInt(currentZoom.value, 10);
        
        const container = document.querySelector('.canvas-container');
        const cw = container ? container.clientWidth : 800;
        const ch = container ? container.clientHeight : 600;
        
        const subL = engineResult.value.subLeft;
        const subR = engineResult.value.subRight;
        const maxH = engineResult.value.fullMaxH !== undefined ? engineResult.value.fullMaxH : engineResult.value.maxH;

        const baseW = (subR - subL) + 200;
        const baseH = maxH + 300; 
        const maxRatio = Math.max(baseW / cw, baseH / ch);

        const VBW = (cw * maxRatio) / (_zoom / 100);
        const VBH = (ch * maxRatio) / (_zoom / 100);

        const centerX = (subL + subR) / 2;
        const centerY = 500 - maxH / 2;

        const X = centerX - pan.value.x - (VBW / 2);
        const Y = centerY - pan.value.y - (VBH / 2);
        
        return `${X} ${Y} ${VBW} ${VBH}`;
    });

    // =========================================
    // 5. 核心渲染路径：SVG Path 生成
    // 将 engine.js 计算出的高度场 (profiles) 转换为可以带填充色的多边形
    // =========================================
    const basePathData = computed(() => {
        let paths = [];
        if (!engineResult.value || !engineResult.value.profiles) return paths;
        let profiles = engineResult.value.profiles;
        let minX = engineResult.value.minX;
        let gridWidth = engineResult.value.gridWidth;
        let GRID_RES = engineResult.value.GRID_RES || 1;
        let subL = engineResult.value.subLeft !== undefined ? engineResult.value.subLeft : -2000;
        let subR = engineResult.value.subRight !== undefined ? engineResult.value.subRight : 2000;

        if (!profiles || profiles.length === 0 || !processSteps.value) return paths;

        processSteps.value.forEach((step, idx) => {
            if (step.type === 'etch' || step.type === 'cmp' || !step.visible) return;
            
            const bottomProf = profiles[idx];
            const topProf = profiles[idx + 1];
            if (!bottomProf || !topProf) return;

            const rad = step.angle * Math.PI / 180;
            const taperHalf = step.angle < 90 && step.thickness > 0 ? (step.thickness / 2) / Math.tan(rad) : 0;

            if (!step.patterns) return;
            step.patterns.forEach((p, pIdx) => {
                let pStartX = minX;
                let pEndX = minX + (gridWidth - 1) / GRID_RES;
                
                if (idx !== 0 && (!step.name || !step.name.includes('ILD'))) {
                    pStartX = Math.max(subL, Math.floor(p.x - p.w/2 - taperHalf - 5));
                    pEndX = Math.min(subR, Math.ceil(p.x + p.w/2 + taperHalf + 5));
                }

                // 计算物理坐标映射到分辨率网格数组的起始下标
                let iStart = Math.max(0, Math.floor((pStartX - minX) * GRID_RES));
                let iEnd = Math.min(gridWidth - 1, Math.ceil((pEndX - minX) * GRID_RES));

                let topPoints = [];
                for (let i = iStart; i <= iEnd; i++) {
                    let x = minX + i / GRID_RES;
                    let y = topProf[i];
                    for (let n = idx + 2; n < profiles.length; n++) {
                        y = Math.min(y, profiles[n][i]);
                    }
                    let vy = 500 - y;
                    
                    if (topPoints.length >= 2) {
                        let p1 = topPoints[topPoints.length - 1];
                        let p0 = topPoints[topPoints.length - 2];
                        if (Math.abs((p1.x - p0.x) * (vy - p1.y) - (x - p1.x) * (p1.y - p0.y)) <= 1e-3) {
                            topPoints[topPoints.length - 1] = {x, y: vy};
                            continue;
                        }
                    }
                    topPoints.push({x, y: vy});
                }

                let bottomPoints = [];
                for (let i = iEnd; i >= iStart; i--) {
                    let x = minX + i / GRID_RES;
                    let y = bottomProf[i];
                    for (let n = idx + 1; n < profiles.length; n++) {
                        y = Math.min(y, profiles[n][i]);
                    }
                    let vy = 500 - y;
                    
                    if (bottomPoints.length >= 2) {
                        let p1 = bottomPoints[bottomPoints.length - 1];
                        let p0 = bottomPoints[bottomPoints.length - 2];
                        if (Math.abs((p1.x - p0.x) * (vy - p1.y) - (x - p1.x) * (p1.y - p0.y)) <= 1e-3) {
                            bottomPoints[bottomPoints.length - 1] = {x, y: vy};
                            continue;
                        }
                    }
                    bottomPoints.push({x, y: vy});
                }

                let d = [];
                topPoints.forEach((pt, ti) => { d.push(`${ti === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`); });
                bottomPoints.forEach(pt => { d.push(`L ${pt.x} ${pt.y}`); });
                d.push('Z');
                
                if (d.length <= 2) return;

                paths.push({ id: step.id + '-' + pIdx, d: d.join(' '), fill: step.color, idx: idx, pIdx: pIdx });
            });
        });

        return paths;
    });

    // 分离高亮状态计算，防止由于鼠标移动引起的数万次坐标重运算卡顿
    const svgPaths = computed(() => {
        if (!basePathData.value) return [];
        return basePathData.value.map(p => {
            const isHighlit = (p.idx === hoverLayerIndex.value && p.pIdx === hoverPatternIndex.value) ||
                              (p.idx === activeLayerIndex.value && p.pIdx === focusedPatternIndex.value) ||
                              (p.idx === activeLayerIndex.value && p.pIdx === hoverCardPatternIndex.value);
            return {
                id: p.id,
                d: p.d,
                fill: p.fill,
                idx: p.idx,
                pIdx: p.pIdx,
                isHighlight: isHighlit
            };
        });
    });

    const handleKeyDown = (e) => {
        const _zoom = parseInt(currentZoom.value, 10);
        const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key);

        if (_zoom <= 100) {
            if (isArrow) {
                pan.value.x = 0;
                pan.value.y = 0;
            }
            return;
        }

        if (!isArrow) return;
        e.preventDefault(); 

        const container = document.querySelector('.canvas-container');
        const cw = container ? container.clientWidth : 800;
        const ch = container ? container.clientHeight : 600;
        const baseW = (engineResult.value.subRight - engineResult.value.subLeft) + 200;
        const baseH = engineResult.value.maxH + 300;
        const maxRatio = Math.max(baseW / cw, baseH / ch);
        const scale = maxRatio / (_zoom / 100);
        const panStep = 30 * scale;

        switch(e.key) {
            case 'ArrowLeft': case 'a': pan.value.x += panStep; break;
            case 'ArrowRight': case 'd': pan.value.x -= panStep; break;
            case 'ArrowUp': case 'w': pan.value.y += panStep; break;
            case 'ArrowDown': case 's': pan.value.y -= panStep; break;
        }
    };

    return {
        currentZoom,
        pan,
        resetZoom,
        startPan,
        doPan,
        endPan,
        axisElements,
        viewBox,
        svgPaths,
        handleKeyDown
    };
}
