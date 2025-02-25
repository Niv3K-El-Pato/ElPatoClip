import { keyframes, styled } from 'styled-components';

export const Page = styled.div`
`;

export const Header = styled.div`
`;

export const Container = styled.div`
  display: grid;
  gap: 3em;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

export const ModalOverlay = styled.div`
  z-index: 2;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  > div {
    margin: 1em;
    max-width: 100%;
    max-height: 100%;
  }
  animation: ${fadeIn} 0.2s ease-in-out;
`;

export const LoadingContainer = styled.div`
  grid-column: 1 / 3;
  display: flex;
  width: 100%;
  padding: 2em;
  justify-content: center;
  align-items: center;
`;

export const ProfileDetails = styled.div`
  padding: 1em 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5em;
  font-size: 1.1em;

  img {
    width: 5ch;
    aspect-ratio: 1 / 1;
    border-radius: 100%;
    padding: 4px;
    border: solid 2px #D9D9D9;
  }
`;

export const FilterContainer = styled.div`
  white-space: nowrap;
  padding: 0.5em 2.5em 0.5em 0.5em;
  margin-left: -0.5em;
  display: flex;
  gap: 0.5em;
  overflow: auto;
  max-width: 100%;
`;

export const InfoLabel = styled.div`
  text-align: center;
`;