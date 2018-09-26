import React, { Component } from 'react';
import iconAdd from '../res/icon_add.svg';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import './Header.css';

class Header extends Component {
  render() {
    let groupControls;
    if (this.props.groupControls) {
      groupControls = (<div className="group-controls">
        <Link to={{ pathname: '/edit/new' }}>
          <img src={iconAdd} className="icon icon-add" alt="add"/>
        </Link>
      </div>);
    }

    return (
      <div className="header">
        <div className="header-row">
          <div className="header-title">
            <h3>{this.props.title}</h3>
          </div>
          {groupControls}
        </div>
      </div>
    );
  }
}

Header.propTypes = {
  title: PropTypes.string.isRequired,
  groupControls: PropTypes.bool
};

export default Header;


