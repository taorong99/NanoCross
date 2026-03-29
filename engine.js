// engine.js
// Provides the physics simulation logic for height maps (物理厚度及高度场仿真引擎)

// =========================================
// 核心函数：根据各步骤物理参数计算横截面轮廓 (Profiles)
// =========================================
window.calculateProfiles = function(steps) {
    if (!steps || steps.length === 0) return { profiles: [], minX: 0, maxX: 0, gridWidth: 0, subLeft: 0, subRight: 0, maxH: 0 };

    // 1. 初始化坐标系域 (网格和底图范围)
    let subLeft = -400, subRight = 400;
    
    const subPat = steps[0]?.patterns[0];
    if (subPat) {
        subLeft = Math.round(subPat.x - subPat.w / 2);
        subRight = Math.round(subPat.x + subPat.w / 2);
    }

    const minX = subLeft - 100; // Restore buffer to allow viewbox rendering correctly
    const maxX = subRight + 100;
    // 将物理单位转化为高分辨率亚像素数组，解决陡峭角度精度问题。在此折中降低为 10（原来50），以解决实时拖动滑条的性能卡顿问题。
    const GRID_RES = 10; 
    const gridWidth = (maxX - minX) * GRID_RES + 1;
    let profiles = [new Float32Array(gridWidth)]; 

    // 2. 遍历各工艺步骤步进行布尔或加法运算
    steps.forEach((step, idx) => {
        let currentProfile = new Float32Array(profiles[idx]);

        if (!step.visible && step.visible !== undefined) {
             profiles.push(currentProfile);
             return;
        }

        const type = step.type || 'deposit';
        let mask = new Float32Array(gridWidth);
        
        if (type === 'deposit' || type === 'etch') {
            const rad = (step.angle || 90) * Math.PI / 180;
            // deltaX 等于厚度带来的侧壁展曲斜率 (水平增量, 原始物理尺寸)
            let deltaX = step.angle < 90 && step.thickness > 0 ? step.thickness / Math.tan(rad) : 0;

            // 3. 计算图案覆盖掩膜 (Mask), 带有侧壁斜度映射
            (step.patterns || []).forEach(pat => {
                let px = parseFloat(pat.x) || 0;
                let pw = parseFloat(pat.w) || 0;

                // Move coordinate onto grid
                let cx = px - minX;

                // 物理坐标对应的掩膜边缘
                let X0 = cx - pw / 2 - deltaX / 2; // Outer left footprint
                let X1 = cx - pw / 2 + deltaX / 2; // Inner left top
                let X2 = cx + pw / 2 - deltaX / 2; // Inner right top
                let X3 = cx + pw / 2 + deltaX / 2; // Outer right footprint

                // 映射成 GRID_RES 索引空间下的索引
                let iStart = Math.max(0, Math.floor(X0 * GRID_RES));
                let iEnd = Math.min(gridWidth - 1, Math.ceil(X3 * GRID_RES));

                for (let i = iStart; i <= iEnd; i++) {
                    let m = 1;
                    if (deltaX > 0) {
                        let physicalI = i / GRID_RES;
                        let mL = (physicalI - X0) / deltaX;
                        let mR = (X3 - physicalI) / deltaX;
                        m = Math.max(0, Math.min(1, mL, mR));
                    } else {
                        let physicalI = i / GRID_RES;
                        if (physicalI < cx - pw / 2 || physicalI > cx + pw / 2) m = 0;
                    }
                    if (m > mask[i]) mask[i] = m;
                }
            });

            // 4. 将掩膜(Mask)应用于对应的高程图 (累加或刻蚀扣除)
            for (let i = 0; i < gridWidth; i++) {
                if (type === 'deposit') {
                    currentProfile[i] += mask[i] * step.thickness;
                } else if (type === 'etch') {
                    let depth = mask[i] * step.thickness;
                    currentProfile[i] = Math.max(0, currentProfile[i] - depth);
                    
                    // 向下穿透刻蚀所有更底层的结构
                    for(let depthIdx = idx; depthIdx >= 0; depthIdx--) {
                        profiles[depthIdx][i] = Math.max(0, Math.min(profiles[depthIdx][i], currentProfile[i]));
                    }
                }
            }
        } else if (type === 'cmp') {
            // 5. CMP抛光：依据最高点削平指定的厚度
            let stepMaxH = 0;
            for(let i=0; i<gridWidth; i++){
                if(currentProfile[i] > stepMaxH) stepMaxH = currentProfile[i];
            }
            let targetPlane = Math.max(0, stepMaxH - step.thickness);
            for (let i = 0; i < gridWidth; i++) {
                if (currentProfile[i] > targetPlane) currentProfile[i] = targetPlane;
                for(let depthIdx = idx; depthIdx >= 0; depthIdx--) {
                    if (profiles[depthIdx][i] > targetPlane) profiles[depthIdx][i] = targetPlane;
                }
            }
        }
        
        profiles.push(currentProfile);
    });

    let globalMaxH = 0;
    profiles.forEach(p => {
        let maxOfP = 0;
        for(let i=0; i<gridWidth; i++) {
            if(p[i] > maxOfP) maxOfP = p[i];
        }
        if(maxOfP > globalMaxH) globalMaxH = maxOfP;
    });

    return {
        profiles: profiles,
        minX: minX,
        maxX: maxX,
        gridWidth: gridWidth,
        subLeft: subLeft,
        subRight: subRight,
        maxH: globalMaxH,
        GRID_RES: GRID_RES
    };
};