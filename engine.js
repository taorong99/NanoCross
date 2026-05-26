// engine.js
// Provides the core profile calculation for process cross-sections.

function applyStepToProfile(currentProfile, step, idx, profiles, gridWidth, minX, gridRes) {
    const type = step.type || 'deposit';
    const thickness = Number(step.thickness) || 0;
    const angle = Number(step.angle) || 90;

    if (type === 'deposit' || type === 'etch') {
        const mask = new Float32Array(gridWidth);
        const rad = angle * Math.PI / 180;
        const deltaX = angle < 90 && thickness > 0 ? thickness / Math.tan(rad) : 0;

        (step.patterns || []).forEach((pat) => {
            const px = parseFloat(pat.x) || 0;
            const pw = parseFloat(pat.w) || 0;
            const cx = px - minX;

            const x0 = cx - pw / 2 - deltaX / 2;
            const x3 = cx + pw / 2 + deltaX / 2;
            const iStart = Math.max(0, Math.floor(x0 * gridRes));
            const iEnd = Math.min(gridWidth - 1, Math.ceil(x3 * gridRes));

            for (let i = iStart; i <= iEnd; i++) {
                let m = 1;
                if (deltaX > 0) {
                    const physicalI = i / gridRes;
                    const mL = (physicalI - x0) / deltaX;
                    const mR = (x3 - physicalI) / deltaX;
                    m = Math.max(0, Math.min(1, mL, mR));
                } else {
                    const physicalI = i / gridRes;
                    if (physicalI < cx - pw / 2 || physicalI > cx + pw / 2) m = 0;
                }
                if (m > mask[i]) mask[i] = m;
            }
        });

        for (let i = 0; i < gridWidth; i++) {
            if (type === 'deposit') {
                currentProfile[i] += mask[i] * thickness;
            } else {
                const depth = mask[i] * thickness;
                currentProfile[i] = Math.max(0, currentProfile[i] - depth);
                for (let depthIdx = idx; depthIdx >= 0; depthIdx--) {
                    profiles[depthIdx][i] = Math.max(0, Math.min(profiles[depthIdx][i], currentProfile[i]));
                }
            }
        }
        return currentProfile;
    }

    if (type === 'cmp') {
        let stepMaxH = 0;
        for (let i = 0; i < gridWidth; i++) {
            if (currentProfile[i] > stepMaxH) stepMaxH = currentProfile[i];
        }
        const targetPlane = Math.max(0, stepMaxH - thickness);
        for (let i = 0; i < gridWidth; i++) {
            if (currentProfile[i] > targetPlane) currentProfile[i] = targetPlane;
            for (let depthIdx = idx; depthIdx >= 0; depthIdx--) {
                if (profiles[depthIdx][i] > targetPlane) profiles[depthIdx][i] = targetPlane;
            }
        }
    }

    return currentProfile;
}

function getGlobalMaxHeight(profiles, gridWidth) {
    let globalMaxH = 0;
    profiles.forEach((profile) => {
        let maxOfProfile = 0;
        for (let i = 0; i < gridWidth; i++) {
            if (profile[i] > maxOfProfile) maxOfProfile = profile[i];
        }
        if (maxOfProfile > globalMaxH) globalMaxH = maxOfProfile;
    });
    return globalMaxH;
}

window.calculateProfiles = function(steps, options = {}) {
    const requestedGridRes = parseInt(options.gridRes, 10);
    const resolvedGridRes = Number.isFinite(requestedGridRes) && requestedGridRes > 0 ? requestedGridRes : 10;
    const computeFullMaxH = options.computeFullMaxH === true;

    if (!steps || steps.length === 0) {
        return {
            profiles: [],
            minX: 0,
            maxX: 0,
            gridWidth: 0,
            subLeft: 0,
            subRight: 0,
            maxH: 0,
            fullMaxH: 0,
            GRID_RES: resolvedGridRes
        };
    }

    let subLeft = -400;
    let subRight = 400;
    const substratePattern = steps[0]?.patterns?.[0];
    if (substratePattern) {
        subLeft = Math.round(substratePattern.x - substratePattern.w / 2);
        subRight = Math.round(substratePattern.x + substratePattern.w / 2);
    }

    const minX = subLeft - 100;
    const maxX = subRight + 100;
    const gridWidth = (maxX - minX) * resolvedGridRes + 1;
    const profiles = [new Float32Array(gridWidth)];
    const fullProfiles = computeFullMaxH ? [new Float32Array(gridWidth)] : null;

    steps.forEach((step, idx) => {
        let currentProfile = new Float32Array(profiles[idx]);

        if (!step.visible && step.visible !== undefined) {
            profiles.push(currentProfile);
            if (computeFullMaxH && fullProfiles) {
                const fullStep = { ...step, visible: true };
                let currentFullProfile = new Float32Array(fullProfiles[idx]);
                currentFullProfile = applyStepToProfile(
                    currentFullProfile,
                    fullStep,
                    idx,
                    fullProfiles,
                    gridWidth,
                    minX,
                    resolvedGridRes
                );
                fullProfiles.push(currentFullProfile);
            }
            return;
        }

        currentProfile = applyStepToProfile(
            currentProfile,
            step,
            idx,
            profiles,
            gridWidth,
            minX,
            resolvedGridRes
        );
        profiles.push(currentProfile);

        if (computeFullMaxH && fullProfiles) {
            let currentFullProfile = new Float32Array(fullProfiles[idx]);
            currentFullProfile = applyStepToProfile(
                currentFullProfile,
                step,
                idx,
                fullProfiles,
                gridWidth,
                minX,
                resolvedGridRes
            );
            fullProfiles.push(currentFullProfile);
        }
    });

    const maxH = getGlobalMaxHeight(profiles, gridWidth);
    const fullMaxH = computeFullMaxH && fullProfiles
        ? getGlobalMaxHeight(fullProfiles, gridWidth)
        : undefined;

    return {
        profiles,
        minX,
        maxX,
        gridWidth,
        subLeft,
        subRight,
        maxH,
        fullMaxH,
        GRID_RES: resolvedGridRes
    };
};
