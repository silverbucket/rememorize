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
var icon_add_svg_1 = require("../res/icon_add.svg");
var prop_types_1 = require("prop-types");
require("./Header.css");
var Header = /** @class */ (function (_super) {
    __extends(Header, _super);
    function Header() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    Header.prototype.render = function () {
        var groupControls;
        if (this.props.groupControls) {
            groupControls = className = "group-controls" >
                to;
            {
                {
                    pathname: '/edit/new';
                }
            }
             >
                src;
            {
                icon_add_svg_1.default;
            }
            className = "icon icon-add";
            alt = "add" /  >
                /Link>
                < /div>);;
        }
        return className = "header" >
            className;
        "header-row" >
            className;
        "header-title" >
            { this: .props.title } < /h3>
            < /div>;
        {
            groupControls;
        }
        /div>
            < /div>;
        ;
    };
    return Header;
}(react_1.Component));
Header.propTypes = {
    title: prop_types_1.default.string.isRequired,
    groupControls: prop_types_1.default.bool
};
exports.default = Header;
