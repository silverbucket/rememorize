import * as React from 'react';
import './Header.css';
declare type HeaderProps = {
    title: string;
    groupControls: boolean;
};
declare class Header extends React.Component<HeaderProps, {}> {
    render(): JSX.Element;
}
export default Header;
