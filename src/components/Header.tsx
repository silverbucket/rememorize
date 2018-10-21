import * as React from 'react';
import iconAdd from './../res/icon_add.svg';
import { Link } from 'react-router-dom';
import './Header.css';

type HeaderProps = {
  title: string;
  groupControls: boolean;
};

class Header extends React.Component<HeaderProps, {}> {
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


export default Header;


