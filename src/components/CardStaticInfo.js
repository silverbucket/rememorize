"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    }
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = require("react");
var prop_types_1 = require("prop-types");
var CardTile_1 = require("./CardTile");
require("./CardStaticInfo.css");
var CardStaticInfo = /** @class */ (function (_super) {
    __extends(CardStaticInfo, _super);
    function CardStaticInfo() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    CardStaticInfo.prototype.render = function () {
        return className = "card-static-info" >
            className;
        "card-familiarity" >
            familiarity;
        /span> {this.props.card.familiarity}
            < /div>
            < div;
        className = "card-familiarity" >
            times;
        reviewed: /span> {this.props.card.reviewedCount}
            < /div>
            < div;
        className = "card-reviewed-at" >
            last;
        reviewed: /span> {this.props.card.reviewedAt}
            < /div>
            < div;
        className = "card-updated-at" >
            updated;
        /span> {this.props.card.updatedAt}
            < /div>
            < div;
        className = "card-created-at" >
            created;
        /span> {this.props.card.createdAt}
            < /div>
            < div;
        className = "card-id" >
            id < /span>: {this.props.card['@id']}
            < /div>
            < /div>;
        ;
    };
    return CardStaticInfo;
}(react_1.Component));
CardStaticInfo.propTypes = {
    card: prop_types_1.default.shape(CardTile_1.default)
};
exports.default = CardStaticInfo;
