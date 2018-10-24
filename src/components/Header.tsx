import * as React from 'react';
import iconAdd from './../res/icon_add.svg';
import iconEye from './../res/icon_eye.svg';
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
                <div>
                    <div className="icon-border">
                        <Link to='/'>
                            <img src={iconEye} className="icon icon-review" alt="review"/>
                        </Link>
                    </div>
                </div>
                <div>
                    <div className="icon-border">
                        <Link to={{ pathname: '/edit/new' }}>
                            <img src={iconAdd} className="icon icon-add" alt="add"/>
                        </Link>
                    </div>
                </div>
            </div>);
        }

        return (
            <div className="header-wrapper">
                <div className="title">
                    <h3>{this.props.title}</h3>
                </div>
                {groupControls}
            </div>
        );
    }
}


export default Header;


