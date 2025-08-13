// frontend/src/utils/sessionUtils.js
const LOCATION_FILTER_KEY = 'superadmin_location_filter';

export const setLocationFilter = (locationId) => {
    if (locationId) {
        sessionStorage.setItem(LOCATION_FILTER_KEY, locationId);
    } else {
        sessionStorage.removeItem(LOCATION_FILTER_KEY);
    }
};

export const getLocationFilter = () => {
    return sessionStorage.getItem(LOCATION_FILTER_KEY);
};