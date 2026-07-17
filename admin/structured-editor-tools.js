(function attachStructuredEditorTools(root, factory) {
    'use strict';

    const tools = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = tools;
    }

    if (root) {
        root.AdminStructuredEditorTools = tools;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStructuredEditorTools() {
    'use strict';

    const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    const DELETE_VALUE = Symbol('leaderspro-admin-delete');
    const DEFAULT_RECORD_KEYS = Object.freeze(['src', 'id']);
    const DEFAULT_PLAN_ALIASES = Object.freeze({
        'all-in-one-monthly': Object.freeze(['disabled-license-bundle-monthly']),
        'all-in-one-quarterly': Object.freeze(['disabled-license-bundle-quarterly']),
        'all-in-one-yearly': Object.freeze(['disabled-license-bundle-yearly']),
        'all-in-one-lifetime': Object.freeze(['disabled-license-bundle-lifetime']),
    });

    function isPlainObject(value) {
        if (value === null || typeof value !== 'object') return false;
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    }

    function cloneValue(value) {
        if (Array.isArray(value)) {
            return value.map(cloneValue);
        }

        if (!isPlainObject(value)) {
            return value;
        }

        const clone = {};
        Object.keys(value).forEach((key) => {
            if (!BLOCKED_KEYS.has(key)) {
                clone[key] = cloneValue(value[key]);
            }
        });
        return clone;
    }

    function normalizeRecordKeys(keys) {
        const source = Array.isArray(keys) ? keys : DEFAULT_RECORD_KEYS;
        const seen = new Set();
        return source.reduce((result, key) => {
            if (typeof key !== 'string' || !key || BLOCKED_KEYS.has(key) || seen.has(key)) {
                return result;
            }
            seen.add(key);
            return result.concat(key);
        }, []);
    }

    function comparableIdentity(value) {
        if (typeof value === 'string' && value.length > 0) return `string:${value}`;
        if (typeof value === 'number' && Number.isFinite(value)) return `number:${value}`;
        return null;
    }

    function findRecordIndex(records, candidate, keys, claimedIndexes) {
        if (!isPlainObject(candidate)) return -1;

        for (const key of keys) {
            if (!Object.prototype.hasOwnProperty.call(candidate, key)) continue;
            const candidateIdentity = comparableIdentity(candidate[key]);
            if (candidateIdentity === null) continue;

            const index = records.findIndex((record, recordIndex) => {
                if (claimedIndexes.has(recordIndex) || !isPlainObject(record)) return false;
                return comparableIdentity(record[key]) === candidateIdentity;
            });
            if (index >= 0) return index;
        }

        return -1;
    }

    function mergeRecordArrayInternal(base, patch, options, mergeRecord) {
        const baseRecords = Array.isArray(base) ? base : [];
        const patchRecords = Array.isArray(patch) ? patch : [];
        const keys = normalizeRecordKeys(options?.keys);
        const replaceMembership = options?.replaceMembership === true;
        const claimedIndexes = new Set();
        const matchedPatches = new Map();
        const newPatches = [];

        patchRecords.forEach((record) => {
            const matchIndex = findRecordIndex(baseRecords, record, keys, claimedIndexes);
            if (matchIndex >= 0) {
                claimedIndexes.add(matchIndex);
                matchedPatches.set(matchIndex, record);
            } else {
                newPatches.push(record);
            }
        });

        if (replaceMembership) {
            const availableIndexes = new Set();
            return patchRecords.map((record) => {
                const matchIndex = findRecordIndex(baseRecords, record, keys, availableIndexes);
                if (matchIndex < 0) return cloneValue(record);
                availableIndexes.add(matchIndex);
                return mergeRecord(baseRecords[matchIndex], record);
            });
        }

        const retained = baseRecords.map((record, index) => {
            if (!matchedPatches.has(index)) return cloneValue(record);
            return mergeRecord(record, matchedPatches.get(index));
        });
        return retained.concat(newPatches.map(cloneValue));
    }

    function mergeValue(base, patch, options) {
        if (patch === DELETE_VALUE) return DELETE_VALUE;
        if (Array.isArray(patch)) {
            if (Array.isArray(base)
                && patch.every(isPlainObject)
                && base.every(isPlainObject)) {
                return mergeRecordArrayInternal(
                    base,
                    patch,
                    {
                        keys: options?.arrayRecordKeys,
                        replaceMembership: options?.replaceArrayMembership === true,
                    },
                    (baseRecord, patchRecord) => mergeValue(baseRecord, patchRecord, options),
                );
            }
            return cloneValue(patch);
        }

        if (!isPlainObject(patch)) {
            return cloneValue(patch);
        }

        const merged = isPlainObject(base) ? cloneValue(base) : {};
        Object.keys(patch).forEach((key) => {
            if (!BLOCKED_KEYS.has(key)) {
                const nextValue = mergeValue(
                    isPlainObject(base) ? base[key] : undefined,
                    patch[key],
                    options,
                );
                if (nextValue === DELETE_VALUE) delete merged[key];
                else merged[key] = nextValue;
            }
        });
        return merged;
    }

    function mergeRecordArray(base, patch, options) {
        return mergeRecordArrayInternal(
            base,
            patch,
            options || {},
            (baseRecord, patchRecord) => mergeValue(baseRecord, patchRecord, {
                arrayRecordKeys: normalizeRecordKeys(options?.keys),
                replaceArrayMembership: true,
            }),
        );
    }

    function mergeContent(base, patch, options) {
        return mergeValue(base, patch, {
            arrayRecordKeys: normalizeRecordKeys(options?.arrayRecordKeys),
            replaceArrayMembership: options?.replaceArrayMembership !== false,
        });
    }

    function valuesEqual(left, right) {
        if (Object.is(left, right)) return true;
        if (Array.isArray(left) || Array.isArray(right)) {
            if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
            return left.every((value, index) => valuesEqual(value, right[index]));
        }
        if (!isPlainObject(left) || !isPlainObject(right)) return false;
        const leftKeys = Object.keys(left).filter((key) => !BLOCKED_KEYS.has(key));
        const rightKeys = Object.keys(right).filter((key) => !BLOCKED_KEYS.has(key));
        if (leftKeys.length !== rightKeys.length) return false;
        return leftKeys.every((key) => (
            Object.prototype.hasOwnProperty.call(right, key)
            && valuesEqual(left[key], right[key])
        ));
    }

    function changedValue(base, current) {
        if (valuesEqual(base, current)) return undefined;
        if (current === undefined) return DELETE_VALUE;
        if (!isPlainObject(current)) return cloneValue(current);
        const changed = {};
        const baseObject = isPlainObject(base) ? base : {};
        const keys = new Set(Object.keys(baseObject).concat(Object.keys(current)));
        keys.forEach((key) => {
            if (BLOCKED_KEYS.has(key)) return;
            const currentHasKey = Object.prototype.hasOwnProperty.call(current, key);
            if (!currentHasKey) {
                changed[key] = DELETE_VALUE;
                return;
            }
            const value = changedValue(baseObject[key], current[key]);
            if (value !== undefined) changed[key] = value;
        });
        return Object.keys(changed).length > 0 ? changed : undefined;
    }

    function createChangedPatch(base, current) {
        const changed = changedValue(base, current);
        return isPlainObject(changed) ? changed : {};
    }

    function findConflictingPaths(base, latest, patch) {
        const conflicts = [];

        function visit(baseValue, latestValue, patchValue, path) {
            if (patchValue === DELETE_VALUE || Array.isArray(patchValue) || !isPlainObject(patchValue)) {
                const intendedValue = patchValue === DELETE_VALUE ? undefined : patchValue;
                if (!valuesEqual(baseValue, latestValue) && !valuesEqual(intendedValue, latestValue)) {
                    conflicts.push(path || '$');
                }
                return;
            }

            const baseObject = isPlainObject(baseValue) ? baseValue : {};
            const latestObject = isPlainObject(latestValue) ? latestValue : {};
            Object.keys(patchValue).forEach((key) => {
                if (BLOCKED_KEYS.has(key)) return;
                visit(
                    baseObject[key],
                    latestObject[key],
                    patchValue[key],
                    path ? `${path}.${key}` : key,
                );
            });
        }

        visit(base, latest, patch, '');
        return conflicts;
    }

    function normalizePlanAliases(aliases) {
        const source = isPlainObject(aliases) ? aliases : DEFAULT_PLAN_ALIASES;
        return Object.keys(source).reduce((result, canonicalId) => {
            if (BLOCKED_KEYS.has(canonicalId)) return result;
            const legacyIds = Array.isArray(source[canonicalId])
                ? source[canonicalId]
                : [source[canonicalId]];
            result[canonicalId] = legacyIds.filter((legacyId, index, values) => (
                typeof legacyId === 'string'
                && legacyId.length > 0
                && !BLOCKED_KEYS.has(legacyId)
                && legacyId !== canonicalId
                && values.indexOf(legacyId) === index
            ));
            return result;
        }, {});
    }

    function mergeAliasedRecords(records, aliases) {
        if (!isPlainObject(records)) return cloneValue(records);
        const aliasMap = normalizePlanAliases(aliases);
        const aliasToCanonical = Object.keys(aliasMap).reduce((result, canonicalId) => {
            aliasMap[canonicalId].forEach((legacyId) => result.set(legacyId, canonicalId));
            return result;
        }, new Map());
        const emittedCanonicalIds = new Set();

        return Object.keys(records).reduce((result, recordId) => {
            if (BLOCKED_KEYS.has(recordId)) return result;
            const canonicalId = aliasToCanonical.get(recordId) || recordId;
            if (!Object.prototype.hasOwnProperty.call(aliasMap, canonicalId)) {
                result[recordId] = cloneValue(records[recordId]);
                return result;
            }
            if (emittedCanonicalIds.has(canonicalId)) return result;

            const mergedLegacyRecord = aliasMap[canonicalId].reduce((merged, legacyId) => (
                Object.prototype.hasOwnProperty.call(records, legacyId)
                    ? mergeValue(merged, records[legacyId], {})
                    : merged
            ), {});
            const canonicalRecord = Object.prototype.hasOwnProperty.call(records, canonicalId)
                ? records[canonicalId]
                : undefined;
            result[canonicalId] = canonicalRecord === undefined
                ? mergedLegacyRecord
                : mergeValue(mergedLegacyRecord, canonicalRecord, {});
            emittedCanonicalIds.add(canonicalId);
            return result;
        }, {});
    }

    function legacyHeroPatch(content) {
        const aliases = {
            heroTitle: 'title',
            heroDesc: 'desc',
            heroBenefit: 'benefit',
            notice: 'notice',
        };
        return Object.keys(aliases).reduce((result, legacyKey) => {
            if (Object.prototype.hasOwnProperty.call(content, legacyKey)) {
                result[aliases[legacyKey]] = cloneValue(content[legacyKey]);
            }
            return result;
        }, {});
    }

    function legacyDownloadPatch(content) {
        if (!isPlainObject(content.downloadUrls)) return {};
        return Object.keys(content.downloadUrls).reduce((result, productId) => {
            if (BLOCKED_KEYS.has(productId)) return result;
            result[productId] = {
                downloads: {
                    windows: { url: cloneValue(content.downloadUrls[productId]) },
                },
            };
            return result;
        }, {});
    }

    function normalizeLegacyContent(content, options) {
        if (!isPlainObject(content)) return {};
        const safeContent = cloneValue(content);
        const heroPatch = legacyHeroPatch(safeContent);
        const downloadPatch = legacyDownloadPatch(safeContent);
        const withCanonicalSections = mergeValue(safeContent, {
            ...(Object.keys(heroPatch).length > 0
                ? { hero: mergeValue(heroPatch, safeContent.hero, {}) }
                : {}),
            ...(Object.keys(downloadPatch).length > 0
                ? { downloads: mergeValue(downloadPatch, safeContent.downloads, {}) }
                : {}),
        }, {});
        const pricing = withCanonicalSections.pricing;

        if (!isPlainObject(pricing) || !isPlainObject(pricing.plans)) {
            return withCanonicalSections;
        }

        const normalizedPlans = mergeAliasedRecords(pricing.plans, options?.planAliases);
        const normalizedPricing = Object.keys(pricing).reduce((result, key) => {
            if (BLOCKED_KEYS.has(key)) return result;
            result[key] = key === 'plans' ? normalizedPlans : cloneValue(pricing[key]);
            return result;
        }, {});
        return Object.keys(withCanonicalSections).reduce((result, key) => {
            if (BLOCKED_KEYS.has(key)) return result;
            result[key] = key === 'pricing'
                ? normalizedPricing
                : cloneValue(withCanonicalSections[key]);
            return result;
        }, {});
    }

    function countCollection(value) {
        if (Array.isArray(value)) return value.length;
        if (isPlainObject(value)) return Object.keys(value).length;
        return 0;
    }

    function summarizeContent(content) {
        const safeContent = isPlainObject(content) ? content : {};
        const pricing = isPlainObject(safeContent.pricing) ? safeContent.pricing : {};
        const hero = isPlainObject(safeContent.hero) ? safeContent.hero : {};

        return {
            products: countCollection(safeContent.products),
            plans: countCollection(pricing.plans),
            downloads: countCollection(safeContent.downloads),
            proofs: countCollection(hero.proofs),
        };
    }

    return Object.freeze({
        createChangedPatch,
        findConflictingPaths,
        mergeAliasedRecords,
        mergeContent,
        mergeRecordArray,
        normalizeLegacyContent,
        summarizeContent,
    });
});
