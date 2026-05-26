// canvas.js - 负责处理画布相关的视图计算、缩放、平移等控制逻辑

function buildSectionPathData(engineResult, processSteps, options = {}) {
    let paths = [];
    if (!engineResult || !engineResult.profiles || !processSteps) return paths;

    let profiles = engineResult.profiles;
    let minX = engineResult.minX;
    let gridWidth = engineResult.gridWidth;
    let GRID_RES = engineResult.GRID_RES || 1;
    let subL = engineResult.subLeft !== undefined ? engineResult.subLeft : -2000;
    let subR = engineResult.subRight !== undefined ? engineResult.subRight : 2000;
    const includeHidden = options.includeHidden === true;
    const idPrefix = options.idPrefix || '';
    const stepFilter = typeof options.stepFilter === 'function' ? options.stepFilter : null;
    const yBase = options.yBase !== undefined ? options.yBase : 500;
    const clipXMin = typeof options.clipXMin === 'number' ? options.clipXMin : null;
    const clipXMax = typeof options.clipXMax === 'number' ? options.clipXMax : null;
    const mapPoint = typeof options.mapPoint === 'function' ? options.mapPoint : null;

    if (!profiles || profiles.length === 0 || !processSteps.length) return paths;

    const suffixMinProfiles = new Array(profiles.length);
    for (let profileIdx = profiles.length - 1; profileIdx >= 0; profileIdx--) {
        const currentProfile = profiles[profileIdx];
        if (!currentProfile) {
            suffixMinProfiles[profileIdx] = null;
            continue;
        }

        if (profileIdx === profiles.length - 1) {
            suffixMinProfiles[profileIdx] = currentProfile;
            continue;
        }

        const nextMinProfile = suffixMinProfiles[profileIdx + 1];
        if (!nextMinProfile) {
            suffixMinProfiles[profileIdx] = currentProfile;
            continue;
        }

        const mergedProfile = new Float32Array(gridWidth);
        for (let i = 0; i < gridWidth; i++) {
            mergedProfile[i] = Math.min(currentProfile[i], nextMinProfile[i]);
        }
        suffixMinProfiles[profileIdx] = mergedProfile;
    }

    const spansFullSubstrate = (pattern) => {
        if (!pattern) return false;
        const centerX = Number(pattern.x) || 0;
        const width = Number(pattern.w) || 0;
        const left = centerX - width / 2;
        const right = centerX + width / 2;
        return left <= subL + 1 && right >= subR - 1;
    };

    processSteps.forEach((step, idx) => {
        if (step.type === 'etch' || step.type === 'cmp') return;
        if (!includeHidden && !step.visible) return;
        if (stepFilter && !stepFilter(step, idx)) return;

        const bottomProf = profiles[idx];
        const topProf = profiles[idx + 1];
        const clippedBottomProf = suffixMinProfiles[idx] || bottomProf;
        const clippedTopProf = suffixMinProfiles[idx + 1] || topProf;
        if (!bottomProf || !topProf) return;

        const thickness = Number(step.thickness) || 0;
        const angle = Number(step.angle) || 90;
        const rad = angle * Math.PI / 180;
        const taperHalf = angle < 90 && thickness > 0 ? (thickness / 2) / Math.tan(rad) : 0;

        if (!step.patterns) return;
        const rendersAcrossSubstrate = step.patterns.length === 1 && spansFullSubstrate(step.patterns[0]);
        step.patterns.forEach((p, pIdx) => {
            let pStartX = minX;
            let pEndX = minX + (gridWidth - 1) / GRID_RES;

            if (idx !== 0 && !rendersAcrossSubstrate) {
                pStartX = Math.max(subL, Math.floor(p.x - p.w / 2 - taperHalf - 5));
                pEndX = Math.min(subR, Math.ceil(p.x + p.w / 2 + taperHalf + 5));
            }
            if (clipXMin !== null) pStartX = Math.max(clipXMin, pStartX);
            if (clipXMax !== null) pEndX = Math.min(clipXMax, pEndX);

            let iStart = Math.max(0, Math.floor((pStartX - minX) * GRID_RES));
            let iEnd = Math.min(gridWidth - 1, Math.ceil((pEndX - minX) * GRID_RES));

            let topPoints = [];
            for (let i = iStart; i <= iEnd; i++) {
                let x = minX + i / GRID_RES;
                let y = clippedTopProf[i];
                let vy = yBase - y;
                const mapped = mapPoint ? mapPoint(x, vy) : { x, y: vy };

                if (topPoints.length >= 2) {
                    let p1 = topPoints[topPoints.length - 1];
                    let p0 = topPoints[topPoints.length - 2];
                    if (Math.abs((p1.x - p0.x) * (mapped.y - p1.y) - (mapped.x - p1.x) * (p1.y - p0.y)) <= 1e-3) {
                        topPoints[topPoints.length - 1] = mapped;
                        continue;
                    }
                }
                topPoints.push(mapped);
            }

            let bottomPoints = [];
            for (let i = iEnd; i >= iStart; i--) {
                let x = minX + i / GRID_RES;
                let y = clippedBottomProf[i];
                let vy = yBase - y;
                const mapped = mapPoint ? mapPoint(x, vy) : { x, y: vy };

                if (bottomPoints.length >= 2) {
                    let p1 = bottomPoints[bottomPoints.length - 1];
                    let p0 = bottomPoints[bottomPoints.length - 2];
                    if (Math.abs((p1.x - p0.x) * (mapped.y - p1.y) - (mapped.x - p1.x) * (p1.y - p0.y)) <= 1e-3) {
                        bottomPoints[bottomPoints.length - 1] = mapped;
                        continue;
                    }
                }
                bottomPoints.push(mapped);
            }

            let d = [];
            topPoints.forEach((pt, ti) => { d.push(`${ti === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`); });
            bottomPoints.forEach(pt => { d.push(`L ${pt.x} ${pt.y}`); });
            d.push('Z');

            if (d.length <= 2) return;

            paths.push({
                id: `${idPrefix}${step.id}-${pIdx}`,
                d: d.join(' '),
                fill: step.color,
                idx: idx,
                pIdx: pIdx
            });
        });
    });

    return paths;
}

window.buildSectionPathData = buildSectionPathData;

function useCanvas(engineResult, triggerResize, processSteps, activeLayerIndex, hoverLayerIndex, hoverPatternIndex, focusedPatternIndex, flashingPatternIndex, hoverCardPatternIndex) {
    const { ref, computed } = Vue;

    const currentZoom = ref(100);
    const pan = ref({ x: 0, y: 0 });
    let isPanning = false;
    let lastMouse = { x: 0, y: 0 };

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

    const viewBox = computed(() => {
        const _trig = triggerResize.value;
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

    const basePathData = computed(() => buildSectionPathData(engineResult.value, processSteps.value || []));

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

        switch (e.key) {
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
