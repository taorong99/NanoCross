// engine.js
// Provides the physics simulation logic for height maps

window.calculateProfiles = function(steps) {
    if (!steps || steps.length === 0) return { profiles: [], minX: 0, maxX: 0, gridWidth: 0, subLeft: 0, subRight: 0, maxH: 0 };

    let subLeft = -400, subRight = 400;
    
    const subPat = steps[0]?.patterns[0];
    if (subPat) {
        subLeft = Math.round(subPat.x - subPat.w / 2);
        subRight = Math.round(subPat.x + subPat.w / 2);
    }

    const minX = subLeft - 100; // Restore buffer to allow viewbox rendering correctly
    const maxX = subRight + 100;
    const gridWidth = maxX - minX + 1;
    let profiles = [new Array(gridWidth).fill(0)]; 

    steps.forEach((step, idx) => {
        let currentProfile = [...profiles[idx]];

        if (!step.visible && step.visible !== undefined) {
             profiles.push(currentProfile);
             return;
        }

        const type = step.type || 'deposit';
        let mask = new Array(gridWidth).fill(0);
        let taperHalf = 0;
        
        if (type === 'deposit' || type === 'etch') {
            const rad = (step.angle || 90) * Math.PI / 180;
            // deltaX equals the total horizontal travel over the full thickness
            let deltaX = step.angle < 90 && step.thickness > 0 ? step.thickness / Math.tan(rad) : 0;

            (step.patterns || []).forEach(pat => {
                let px = parseFloat(pat.x) || 0;
                let pw = parseFloat(pat.w) || 0;

                // Move coordinate onto grid
                let cx = px - minX;

                let X0 = cx - pw / 2 - deltaX / 2; // Outer left footprint
                let X1 = cx - pw / 2 + deltaX / 2; // Inner left top
                let X2 = cx + pw / 2 - deltaX / 2; // Inner right top
                let X3 = cx + pw / 2 + deltaX / 2; // Outer right footprint

                let iStart = Math.max(0, Math.floor(X0));
                let iEnd = Math.min(gridWidth - 1, Math.ceil(X3));

                for (let i = iStart; i <= iEnd; i++) {
                    let m = 1;
                    if (deltaX > 0) {
                        let mL = (i - X0) / deltaX;
                        let mR = (X3 - i) / deltaX;
                        m = Math.max(0, Math.min(1, mL, mR));
                    } else {
                        if (i < cx - pw / 2 || i > cx + pw / 2) m = 0;
                    }
                    mask[i] = Math.max(mask[i], m);
                }
            });

            for (let i = 0; i < gridWidth; i++) {
                if (type === 'deposit') {
                    currentProfile[i] += mask[i] * step.thickness;
                } else if (type === 'etch') {
                    let depth = mask[i] * step.thickness;
                    currentProfile[i] = Math.max(0, currentProfile[i] - depth);
                    
                    for(let depthIdx = idx; depthIdx >= 0; depthIdx--) {
                        profiles[depthIdx][i] = Math.max(0, Math.min(profiles[depthIdx][i], currentProfile[i]));
                    }
                }
            }
        } else if (type === 'cmp') {
            let stepMaxH = Math.max(...currentProfile);
            let targetPlane = Math.max(0, stepMaxH - step.thickness);
            for (let i = 0; i < gridWidth; i++) {
                currentProfile[i] = Math.min(currentProfile[i], targetPlane);
                for(let depthIdx = idx; depthIdx >= 0; depthIdx--) {
                    profiles[depthIdx][i] = Math.min(profiles[depthIdx][i], targetPlane);
                }
            }
        }
        
        profiles.push(currentProfile);
    });

    let globalMaxH = 0;
    profiles.forEach(p => globalMaxH = Math.max(globalMaxH, ...p));

    return {
        profiles: profiles,
        minX: minX,
        maxX: maxX,
        gridWidth: gridWidth,
        subLeft: subLeft,
        subRight: subRight,
        maxH: globalMaxH
    };
};