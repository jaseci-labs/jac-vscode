walker get_profile {
    can run with Root entry {
        report 'ok';
        tweets.sort(key=lambda t: s);
        report 'not ok';
    }
}

walker:pub get_all_profiles {
    can run with Root entry {
        report results;
    }
}

test "mongodb user operations" {
    with MongoDbContainer("mongo:7.0") as mongo {
    }
}
