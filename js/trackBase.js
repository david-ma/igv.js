/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 Regents of the University of California
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 * Author:  Jim Robinson,  2018
 */

"use strict";

var igv = (function (igv) {


    igv.extend = function (parent, child) {

        child.prototype = Object.create(parent.prototype);
        child.prototype.constructor = child;
        child.prototype._super = Object.getPrototypeOf(child.prototype);
        return child;
    }

    /**
     * A collection of properties and methods shared by all (or most) track types.   Used as a mixin
     * by prototype chaining.
     *
     * @param config
     * @param browser
     * @constructor
     */
    igv.TrackBase = function (config, browser) {

        if (config.displayMode) {
            config.displayMode = config.displayMode.toUpperCase();
        }

        this.config = config;
        this.browser = browser;
        this.url = config.url;
        this.type = config.type;

        config.name = config.name || config.label;   // synonym for name, label is deprecated
        if (config.name) {
            this.name = config.name;
        }
        else {
            if (igv.isFilePath(config.url)) this.name = config.url.name;
            else this.name = config.url;
        }

        this.order = config.order;

        if ("civic-ws" === config.sourceType) {    // Ugly proxy for specialized track type
            this.color = "rgb(155,20,20)";
        }
        else {
            this.color = config.color || config.defaultColor || "rgb(0,0,150)";
        }


        this.autoscaleGroup = config.autoscaleGroup;

        this.removable = config.removable === undefined ? true : config.removable;      // Defaults to true

        this.height = config.height || 100;
        this.autoHeight = config.autoHeight === undefined ? (config.height === undefined) : config.autoHeight;
        this.minHeight = config.minHeight || Math.min(25, this.height);
        this.maxHeight = config.maxHeight || Math.max(1000, this.height);

        this.visibilityWindow = config.visibilityWindow;

    };

    /**
     * Default implementation -- return the current state of the "this" object, which should be a this.  Used
     * to create session object for bookmarking, sharing.  Updates the track "config" object to reflect the
     * current state.  Only simple properties (string, number, boolean) are updated.
     */
    igv.TrackBase.prototype.getState = function () {

        const config = Object.assign({}, this.config);
        const self = this;

        Object.keys(config).forEach(function (key) {
            const value = self[key];
            if (value && (igv.isSimpleType(value) || typeof value === "boolean")) {
                config[key] = value;
            }
        })

        return config;
    };

    igv.TrackBase.prototype.supportsWholeGenome = function () {
        return false;
    }

    igv.TrackBase.prototype.clickedFeatures = function (clickState) {

        // We use the cached features rather than method to avoid async load.  If the
        // feature is not already loaded this won't work,  but the user wouldn't be mousing over it either.
        const features = clickState.viewport.getCachedFeatures();

        if (!features || features.length === 0) {
            return [];
        }

        const genomicLocation = clickState.genomicLocation;

        // We need some tolerance around genomicLocation
        const tolerance = 3 * clickState.referenceFrame.bpPerPixel;
        const ss = Math.floor(genomicLocation) - tolerance;
        const ee = Math.ceil(genomicLocation) + tolerance;

        return (igv.FeatureUtils.findOverlapping(features, ss, ee));
    };


    /**
     * Default popup text function -- just extracts string and number properties in random order.
     * @param feature
     * @returns {Array}
     */
    igv.TrackBase.prototype.extractPopupData = function (feature) {

        const filteredProperties = new Set(['row', 'color']);
        const data = [];

        let alleles, alleleFreqs;
        for (var property in feature) {

            if (feature.hasOwnProperty(property) && !filteredProperties.has(property) &&
                igv.isSimpleType(feature[property])) {

                data.push({name: property, value: feature[property]});

                if (property === "alleles") {
                    alleles = feature[property];
                } else if (property === "alleleFreqs") {
                    alleleFreqs = feature[property];
                }
            }
        }

        const genomeId = this.getGenomeId()
        if (alleles && alleleFreqs) {

            if (alleles.endsWith(",")) {
                alleles = alleles.substr(0, alleles.length - 1);
            }
            if (alleleFreqs.endsWith(",")) {
                alleleFreqs = alleleFreqs.substr(0, alleleFreqs.length - 1);
            }

            let a = alleles.split(",");
            let af = alleleFreqs.split(",");
            if (af.length > 1) {
                let b = [];
                for (let i = 0; i < af.length; i++) {
                    b.push({a: a[i], af: Number.parseFloat(af[i])});
                }
                b.sort(function (x, y) {
                    return x.af - y.af
                });

                let ref = b[b.length - 1].a;
                if (ref.length === 1) {
                    for (let i = b.length - 2; i >= 0; i--) {
                        let alt = b[i].a;
                        if (alt.length === 1) {
                            const cravatLink = igv.TrackBase.getCravatLink(feature.chr, feature.start + 1, ref, alt, genomeId)
                            if(cravatLink) {
                                data.push("<hr/>");
                                data.push(cravatLink);
                            }
                        }
                    }
                }
            }
        }


        return data;


    }

    igv.TrackBase.prototype.getGenomeId = function () {
        return this.browser.genome ? this.browser.genome.id : undefined
    }

    igv.TrackBase.getCravatLink = function (chr, position, ref, alt, genomeID) {

        if ("hg38" === genomeID || "GRCh38" === genomeID) {

            const cravatChr = chr.startsWith("chr") ? chr : "chr" + chr

            return "<a target='_blank' " +
                "href='http://www.cravat.us/CRAVAT/variant.html?variant=" +
                cravatChr + "_" + position + "_+_" + ref + "_" + alt + "'>Cravat " + ref + "->" + alt + "</a>"
        }
        else {
            return undefined
        }
    }
//chr22 40418496 - A G

    return igv;


})(igv || {});
